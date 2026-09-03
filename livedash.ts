/**
 * livedash.ts — OLIVIUM DAO LIVE DASHBOARD
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Responsibilities:
 *   • Wallet / email connection UI
 *   • On-chain tree loading
 *   • On-chain OLVM balance
 *   • Supabase Realtime sensor updates
 *   • Supabase Realtime tree updates
 *   • Live Grove ticker
 *   • Live field sensor ticker
 *   • Dashboard refresh
 *   • Villa / Guardian UI bridge
 *   • Compatibility with existing inline HTML handlers
 *
 * IMPORTANT:
 *   - No fake OLVM market price is displayed.
 *   - OLVM remains PRE-LAUNCH until a real market exists.
 *   - Tree count comes from the Anchor program.
 *   - Field sensor data comes from Supabase.
 *   - VITE_OLVM_MINT must contain the REAL OLVM mint address.
 *
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
} from "./src/connection";

import {
  getTrees,
  getAllPositions,
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

import { PublicKey } from "@solana/web3.js";


// ═════════════════════════════════════════════════════════════════════════════
// GLOBAL WINDOW BRIDGE
// ═════════════════════════════════════════════════════════════════════════════

const win = window as any;

console.log("[livedash.ts] 🚀 Module loaded");


// ═════════════════════════════════════════════════════════════════════════════
// CONNECTION BRIDGE
// ═════════════════════════════════════════════════════════════════════════════

win.connectWallet = connectWallet;
win.disconnectWallet = disconnectWallet;
win.connectEmail = connectEmail;
win.isConnected = isConnected;
win.getIdentity = getIdentity;
win.getProgram = getProgram;
win.getProvider = getProvider;
win.handleDisconnectWorkflow = handleDisconnectWorkflow;


// ═════════════════════════════════════════════════════════════════════════════
// RESERVE BOARD BRIDGE
// ═════════════════════════════════════════════════════════════════════════════

win.getTrees = getTrees;
win.getAllPositions = getAllPositions;
win.renderMyTreesFromPositions = renderMyTreesFromPositions;

win.openTreeDetailModal = openTreeDetailModal;
win.closeTreeDetailModal = closeTreeDetailModal;
win.switchTreeDetailTab = switchTreeDetailTab;

win.updateVillaStayUI = updateVillaStayUI;
win.updateStatsUI = updateStatsUI;
win.updateWalletUI = updateWalletUI;

win.openSellModal = openSellModal;
win.closeSellModal = closeSellModal;
win.confirmSellAction = confirmSellAction;
win.setSellMax = setSellMax;


// ═════════════════════════════════════════════════════════════════════════════
// RESERVE B BRIDGE
// ═════════════════════════════════════════════════════════════════════════════

win.updateIdentityBalanceUI = updateIdentityBalanceUI;
win.waitForProgram = waitForProgram;

win.closeModal = closeModal;
win.closeAgreement = closeAgreement;
win.closeConnectModal = closeConnectModal;
win.closeSuccess = closeSuccess;


// ═════════════════════════════════════════════════════════════════════════════
// DOM HELPERS
// ═════════════════════════════════════════════════════════════════════════════

const $ = (id: string): HTMLElement | null =>
  document.getElementById(id);


const connectBtn =
  $("connectBtn") as HTMLButtonElement | null;

const connStatus =
  $("connStatus");

const connStatusText =
  $("conn-status-text");

const walletType =
  $("wallet-type");

const olvBalance =
  $("wallet-olv-balance");

const walletBadge =
  $("wallet-badge");


// ═════════════════════════════════════════════════════════════════════════════
// LIVE STATE
// ═════════════════════════════════════════════════════════════════════════════

let latestSensorData: any | null = null;

let sensorChannel: any = null;
let fieldSensorChannel: any = null;
let treeChannel: any = null;

let tickerUpdateInProgress = false;
let initialized = false;


// ═════════════════════════════════════════════════════════════════════════════
// TICKER
// ═════════════════════════════════════════════════════════════════════════════

interface TickerItem {
  icon: string;
  text: string;
  tone?: "up" | "down" | "neutral";
}


/**
 * Render the ticker.
 *
 * We intentionally render two copies so the CSS marquee can loop continuously.
 */
function renderLiveTicker(items: TickerItem[]) {

  const track =
    document.getElementById("ticker-track");

  if (!track) {
    console.warn(
      "[TICKER] #ticker-track not found."
    );
    return;
  }

  track.innerHTML = "";

  const fragment =
    document.createDocumentFragment();

  for (let copy = 0; copy < 2; copy++) {

    for (const item of items) {

      const span =
        document.createElement("span");

      if (copy === 1) {
        span.setAttribute(
          "aria-hidden",
          "true"
        );
      }

      span.textContent =
        `${item.icon} ${item.text}`;

      if (item.tone === "up") {
        span.classList.add(
          "ticker-up"
        );
      }

      if (item.tone === "down") {
        span.classList.add(
          "ticker-down"
        );
      }

      fragment.appendChild(span);
    }
  }

  track.appendChild(fragment);
}


/**
 * Immediate fallback ticker.
 *
 * This is called before Solana/Supabase initialization so the ticker
 * can never remain visually empty.
 */
function renderTickerFallback() {

  renderLiveTicker([
    {
      icon: "🌳",
      text: "Grove · Growing Phase",
      tone: "neutral",
    },
    {
      icon: "◎",
      text: "OLVM · PRE-LAUNCH",
      tone: "neutral",
    },
    {
      icon: "🫒",
      text: "2026 Season · Growing Phase",
      tone: "neutral",
    },
  ]);
}


// ═════════════════════════════════════════════════════════════════════════════
// ON-CHAIN TREE COUNT
// ═════════════════════════════════════════════════════════════════════════════

async function getLiveTreeCount(): Promise<number | null> {

  try {

    const trees =
      await getTrees();

    if (!Array.isArray(trees)) {
      return null;
    }

    return trees.length;

  } catch (err) {

    console.warn(
      "[TICKER] Unable to read on-chain tree count:",
      err
    );

    return null;
  }
}


// ═════════════════════════════════════════════════════════════════════════════
// LATEST FIELD SENSOR
// ═════════════════════════════════════════════════════════════════════════════

async function getLatestFieldSensor(): Promise<any | null> {

  try {

    const {
      data,
      error,
    } = await sb
      .from("node_sensors")
      .select("*")
      .order(
        "created_at",
        {
          ascending: false,
        }
      )
      .limit(1)
      .maybeSingle();

    if (error) {

      console.warn(
        "[TICKER] node_sensors query failed:",
        error.message
      );

      return null;
    }

    return data ?? null;

  } catch (err) {

    console.warn(
      "[TICKER] node_sensors exception:",
      err
    );

    return null;
  }
}


// ═════════════════════════════════════════════════════════════════════════════
// SENSOR → TICKER
// ═════════════════════════════════════════════════════════════════════════════

function addSensorTickerItems(
  items: TickerItem[],
  sensor: any | null
) {

  if (!sensor) {
    return;
  }


  // Temperature
  if (
    sensor.temperature !== undefined &&
    sensor.temperature !== null
  ) {

    const value =
      Number(sensor.temperature);

    if (Number.isFinite(value)) {

      items.push({
        icon: "🌡",
        text:
          `Field ${value.toFixed(1)}°C`,
        tone: "neutral",
      });
    }
  }


  // Soil moisture
  const soilValue =
    sensor.soil_moisture ??
    sensor.moisture;

  if (
    soilValue !== undefined &&
    soilValue !== null
  ) {

    const value =
      Number(soilValue);

    if (Number.isFinite(value)) {

      items.push({
        icon: "💧",
        text:
          `Soil ${value.toFixed(1)}%`,
        tone: "neutral",
      });
    }
  }


  // Humidity
  if (
    sensor.humidity !== undefined &&
    sensor.humidity !== null
  ) {

    const value =
      Number(sensor.humidity);

    if (Number.isFinite(value)) {

      items.push({
        icon: "💨",
        text:
          `Humidity ${value.toFixed(0)}%`,
        tone: "neutral",
      });
    }
  }


  // Wind
  if (
    sensor.wind_speed !== undefined &&
    sensor.wind_speed !== null
  ) {

    const value =
      Number(sensor.wind_speed);

    if (Number.isFinite(value)) {

      items.push({
        icon: "🌬",
        text:
          `Wind ${value.toFixed(1)} m/s`,
        tone: "neutral",
      });
    }
  }


  // Sensor freshness
  if (sensor.created_at) {

    const timestamp =
      new Date(
        sensor.created_at
      ).getTime();

    if (Number.isFinite(timestamp)) {

      const ageMs =
        Math.max(
          0,
          Date.now() - timestamp
        );

      const ageMinutes =
        Math.round(
          ageMs / 60000
        );

      if (ageMinutes < 2) {

        items.push({
          icon: "●",
          text:
            "Field sensors · Live",
          tone: "up",
        });

      } else {

        items.push({
          icon: "●",
          text:
            `Field sensors · ${ageMinutes} min ago`,
          tone: "neutral",
        });
      }
    }
  }
}


// ═════════════════════════════════════════════════════════════════════════════
// LIVE TICKER UPDATE
// ═════════════════════════════════════════════════════════════════════════════

export async function updateLiveTicker() {

  if (tickerUpdateInProgress) {
    return;
  }

  tickerUpdateInProgress = true;


  try {

    const items: TickerItem[] = [];


    // ─────────────────────────────────────────────────────────────────────────
    // TREE COUNT
    // ─────────────────────────────────────────────────────────────────────────

    const treeCount =
      await getLiveTreeCount();

    if (treeCount !== null) {

      items.push({
        icon: "🌳",
        text:
          `${treeCount} Trees · Growing Phase`,
        tone: "neutral",
      });

    } else {

      items.push({
        icon: "🌳",
        text:
          "Grove · Growing Phase",
        tone: "neutral",
      });
    }


    // ─────────────────────────────────────────────────────────────────────────
    // FIELD SENSOR
    // ─────────────────────────────────────────────────────────────────────────

    const sensor =
      await getLatestFieldSensor();

    if (sensor) {

      latestSensorData =
        sensor;

      addSensorTickerItems(
        items,
        sensor
      );
    }


    // ─────────────────────────────────────────────────────────────────────────
    // OLVM
    //
    // IMPORTANT:
    // Do NOT display a price before a real market exists.
    // ─────────────────────────────────────────────────────────────────────────

    items.push({
      icon: "◎",
      text:
        "OLVM · PRE-LAUNCH",
      tone: "neutral",
    });


    // ─────────────────────────────────────────────────────────────────────────
    // REAL GROVE STATUS
    // ─────────────────────────────────────────────────────────────────────────

    items.push({
      icon: "🫒",
      text:
        "2026 Season · Growing Phase",
      tone: "neutral",
    });


    renderLiveTicker(items);

  } catch (err) {

    console.error(
      "[TICKER] Update failed:",
      err
    );

    renderTickerFallback();

  } finally {

    tickerUpdateInProgress =
      false;
  }
}


win.updateLiveTicker =
  updateLiveTicker;


// ═════════════════════════════════════════════════════════════════════════════
// SENSOR UI
// ═════════════════════════════════════════════════════════════════════════════

function updateSensorUI(
  data: any
) {

  if (!data) {
    return;
  }

  latestSensorData =
    data;


  // Soil moisture
  const moisture =
    data.soil_moisture ??
    data.moisture;

  const moistureEl =
    $("sensor-moisture");

  const moistureBar =
    $("sensor-moisture-bar");


  if (
    moistureEl &&
    moisture !== undefined &&
    moisture !== null
  ) {

    const value =
      Number(moisture);

    moistureEl.textContent =
      `${value}%`;

    if (
      moistureBar &&
      Number.isFinite(value)
    ) {

      (
        moistureBar as HTMLElement
      ).style.width =
        `${Math.max(
          0,
          Math.min(
            100,
            value
          )
        )}%`;
    }
  }


  // Temperature
  const tempEl =
    $("sensor-temp");

  if (
    tempEl &&
    data.temperature !== undefined
  ) {

    tempEl.textContent =
      String(
        data.temperature
      );
  }


  // Humidity
  const humidityEl =
    $("sensor-humidity");

  if (
    humidityEl &&
    data.humidity !== undefined
  ) {

    humidityEl.textContent =
      String(
        data.humidity
      );
  }


  // Wind
  const windEl =
    $("live-wind");

  if (
    windEl &&
    data.wind_speed !== undefined
  ) {

    windEl.textContent =
      String(
        data.wind_speed
      );
  }


  // Altitude
  const altEl =
    $("live-alt");

  if (
    altEl &&
    data.altitude !== undefined
  ) {

    altEl.textContent =
      String(
        data.altitude
      );
  }


  // GPS
  const gpsEl =
    $("live-gps");

  if (
    gpsEl &&
    data.gps !== undefined
  ) {

    gpsEl.textContent =
      String(
        data.gps
      );
  }


  // Sensor count
  const sensorCountEl =
    $("live-sensor-count");

  if (
    sensorCountEl &&
    data.sensor_count !== undefined
  ) {

    sensorCountEl.textContent =
      String(
        data.sensor_count
      );
  }


  updateWeatherUI(data);

  void updateLiveTicker();
}


// ═════════════════════════════════════════════════════════════════════════════
// WEATHER UI
// ═════════════════════════════════════════════════════════════════════════════

function updateWeatherUI(
  data: any
) {

  if (!data) {
    return;
  }


  // Main temperature
  const tempEl =
    $("weather-temp");

  if (
    tempEl &&
    data.temperature !== undefined
  ) {

    tempEl.textContent =
      String(
        data.temperature
      );
  }


  // Main humidity
  const humidityEl =
    $("weather-humidity");

  if (
    humidityEl &&
    data.humidity !== undefined
  ) {

    humidityEl.textContent =
      String(
        data.humidity
      );
  }


  // Main wind
  const windEl =
    $("weather-wind");

  if (
    windEl &&
    data.wind_speed !== undefined
  ) {

    windEl.textContent =
      String(
        data.wind_speed
      );
  }


  // UV
  const uvEl =
    $("weather-uv");

  if (
    uvEl &&
    data.uv_index !== undefined
  ) {

    uvEl.textContent =
      String(
        data.uv_index
      );
  }


  // Member temperature
  const memberTemp =
    $("weather-temp-m");

  if (
    memberTemp &&
    data.temperature !== undefined
  ) {

    memberTemp.textContent =
      String(
        data.temperature
      );
  }


  // Member description
  const memberDesc =
    $("weather-desc-m");

  if (
    memberDesc &&
    data.weather_description !== undefined
  ) {

    memberDesc.textContent =
      String(
        data.weather_description
      );
  }
}


// ═════════════════════════════════════════════════════════════════════════════
// SUPABASE SENSOR REALTIME — sensor_readings
// ═════════════════════════════════════════════════════════════════════════════

export function subscribeToSensorData() {

  if (sensorChannel) {

    try {
      sensorChannel.unsubscribe();
    } catch (_) {}

    sensorChannel =
      null;
  }


  sensorChannel =
    sb
      .channel(
        "sensor-updates"
      )

      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "sensor_readings",
        },
        (payload) => {

          console.log(
            "[SENSOR] INSERT:",
            payload.new
          );

          updateSensorUI(
            payload.new
          );
        }
      )

      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "sensor_readings",
        },
        (payload) => {

          console.log(
            "[SENSOR] UPDATE:",
            payload.new
          );

          updateSensorUI(
            payload.new
          );
        }
      )

      .subscribe(
        (status) => {

          console.log(
            "[SENSOR] sensor_readings:",
            status
          );
        }
      );


  return sensorChannel;
}


// ═════════════════════════════════════════════════════════════════════════════
// SUPABASE SENSOR REALTIME — node_sensors
// ═════════════════════════════════════════════════════════════════════════════

export function subscribeToFieldSensorData() {

  if (fieldSensorChannel) {

    try {
      fieldSensorChannel.unsubscribe();
    } catch (_) {}

    fieldSensorChannel =
      null;
  }


  fieldSensorChannel =
    sb
      .channel(
        "node-sensor-updates"
      )

      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "node_sensors",
        },
        (payload) => {

          console.log(
            "[NODE_SENSOR] INSERT:",
            payload.new
          );

          updateSensorUI(
            payload.new
          );
        }
      )

      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "node_sensors",
        },
        (payload) => {

          console.log(
            "[NODE_SENSOR] UPDATE:",
            payload.new
          );

          updateSensorUI(
            payload.new
          );
        }
      )

      .subscribe(
        (status) => {

          console.log(
            "[NODE_SENSOR] Subscription:",
            status
          );
        }
      );


  return fieldSensorChannel;
}


// ═════════════════════════════════════════════════════════════════════════════
// TREE REALTIME
// ═════════════════════════════════════════════════════════════════════════════
//
// IMPORTANT:
// reserve_board.ts does NOT export loadTrees().
// Therefore this controller does NOT call loadTrees().
//
// updateStatsUI() and getTrees() remain the public interfaces used here.
// ═════════════════════════════════════════════════════════════════════════════

export function subscribeToTreeUpdates() {

  if (treeChannel) {

    try {
      treeChannel.unsubscribe();
    } catch (_) {}

    treeChannel =
      null;
  }


  treeChannel =
    sb
      .channel(
        "tree-updates"
      )

      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tree_metadata",
        },
        async () => {

          console.log(
            "[TREE] Change detected."
          );


          try {

            await updateStatsUI();

            await updateLiveTicker();

          } catch (err) {

            console.error(
              "[TREE] Refresh failed:",
              err
            );
          }
        }
      )

      .subscribe(
        (status) => {

          console.log(
            "[TREE] Subscription:",
            status
          );
        }
      );


  return treeChannel;
}


// ═════════════════════════════════════════════════════════════════════════════
// WALLET UI
// ═════════════════════════════════════════════════════════════════════════════

export function updateWalletConnectionUI() {

  const identity =
    getIdentity();


  // ───────────────────────────────────────────────────────────────────────────
  // GUEST / DISCONNECTED
  // ───────────────────────────────────────────────────────────────────────────

  if (
    !identity ||
    identity.type === "guest"
  ) {

    if (connStatusText) {
      connStatusText.textContent =
        "disconnected";
    }

    if (walletType) {
      walletType.textContent =
        "Guest";
    }

    if (olvBalance) {
      olvBalance.textContent =
        "0";
    }


    if (connectBtn) {

      connectBtn.textContent =
        "Connect Phantom";

      connectBtn.style.background =
        "#2b7a3e";
    }


    if (connStatus) {

      const dot =
        connStatus.querySelector("i");

      if (dot) {

        (
          dot as HTMLElement
        ).style.color =
          "#ffaa33";
      }
    }


    if (walletBadge) {
      walletBadge.textContent =
        "Guest";
    }

    return;
  }


  // ───────────────────────────────────────────────────────────────────────────
  // PHANTOM WALLET
  // ───────────────────────────────────────────────────────────────────────────

  if (
    identity.type === "wallet" &&
    identity.wallet
  ) {

    const short =
      identity.label ||
      (
        identity.wallet.slice(
          0,
          4
        ) +
        "…" +
        identity.wallet.slice(
          -4
        )
      );


    if (connStatusText) {
      connStatusText.textContent =
        "connected";
    }

    if (walletType) {
      walletType.textContent =
        "Phantom";
    }


    if (connectBtn) {

      connectBtn.textContent =
        `🔑 ${short}`;

      connectBtn.style.background =
        "#4a6741";
    }


    if (connStatus) {

      const dot =
        connStatus.querySelector("i");

      if (dot) {

        (
          dot as HTMLElement
        ).style.color =
          "#3dcc6a";
      }
    }


    if (walletBadge) {
      walletBadge.textContent =
        "Connected";
    }

    return;
  }


  // ───────────────────────────────────────────────────────────────────────────
  // EMAIL
  // ───────────────────────────────────────────────────────────────────────────

  if (
    identity.type === "email"
  ) {

    if (connStatusText) {
      connStatusText.textContent =
        "email secured";
    }

    if (walletType) {
      walletType.textContent =
        "Email";
    }


    if (connectBtn) {

      connectBtn.textContent =
        `✉️ ${
          identity.label ||
          "Account"
        }`;

      connectBtn.style.background =
        "#4a6741";
    }


    if (connStatus) {

      const dot =
        connStatus.querySelector("i");

      if (dot) {

        (
          dot as HTMLElement
        ).style.color =
          "#3dcc6a";
      }
    }


    if (walletBadge) {
      walletBadge.textContent =
        "Email";
    }
  }
}


win.updateWalletConnectionUI =
  updateWalletConnectionUI;


// ═════════════════════════════════════════════════════════════════════════════
// CONNECT BUTTON
// ═════════════════════════════════════════════════════════════════════════════

export async function handleConnectClick() {

  try {

    if (isConnected()) {

      console.log(
        "[WALLET] Disconnect requested."
      );

      await handleDisconnectWorkflow();

      updateWalletConnectionUI();

      await updateIdentityBalanceUI();

      await updateLiveTicker();

      return;
    }


    const modal =
      $("connectModal");

    if (modal) {

      modal.style.display =
        "flex";
    }

  } catch (err) {

    console.error(
      "[WALLET] Connect/disconnect error:",
      err
    );
  }
}


win.handleConnectClick =
  handleConnectClick;


// ═════════════════════════════════════════════════════════════════════════════
// COMPATIBILITY EVENT
// ═════════════════════════════════════════════════════════════════════════════
//
// Existing HTML may dispatch:
//     olivium:connect-requested
//
// Catch it here so the HTML does not need to know the wallet implementation.
// ═════════════════════════════════════════════════════════════════════════════

window.addEventListener(
  "olivium:connect-requested",
  async () => {

    console.log(
      "[LIVEDASH] Connect request received."
    );

    await handleConnectClick();
  }
);


// ═════════════════════════════════════════════════════════════════════════════
// OLVM TOKEN
// ═════════════════════════════════════════════════════════════════════════════

const OLVM_MINT_ADDRESS =
  import.meta.env.VITE_OLVM_MINT || "";


/**
 * Fetch the REAL OLVM balance for a wallet.
 *
 * This does not fabricate a balance.
 * It reads SPL token accounts directly from Solana.
 */
export async function fetchOLVMBalance(
  walletAddress: string
): Promise<number> {

  if (!OLVM_MINT_ADDRESS) {

    console.warn(
      "[OLVM] VITE_OLVM_MINT is not configured."
    );

    return 0;
  }


  try {

    const owner =
      new PublicKey(
        walletAddress
      );

    const mint =
      new PublicKey(
        OLVM_MINT_ADDRESS
      );


    const result =
      await connection
        .getParsedTokenAccountsByOwner(
          owner,
          {
            mint,
          }
        );


    let total = 0;


    for (
      const account
      of result.value
    ) {

      const parsed =
        account.account.data.parsed;

      const tokenAmount =
        parsed?.info?.tokenAmount;


      if (
        tokenAmount &&
        tokenAmount.uiAmount !== null &&
        tokenAmount.uiAmount !== undefined
      ) {

        total +=
          Number(
            tokenAmount.uiAmount
          );
      }
    }


    return total;

  } catch (err) {

    console.warn(
      "[OLVM] Balance fetch failed:",
      err
    );

    return 0;
  }
}


// Compatibility alias
export async function fetchOLVBalance(
  walletAddress: string
): Promise<number> {

  return fetchOLVMBalance(
    walletAddress
  );
}


win.fetchOLVMBalance =
  fetchOLVMBalance;

win.fetchOLVBalance =
  fetchOLVBalance;


// ═════════════════════════════════════════════════════════════════════════════
// DASHBOARD REFRESH
// ═════════════════════════════════════════════════════════════════════════════

export async function refreshDashboard() {

  console.log(
    "[DASH] Refreshing dashboard..."
  );


  try {

    // Wallet state
    updateWalletConnectionUI();


    // Identity / OLVM
    await updateIdentityBalanceUI();


    // On-chain tree state
    //
    // DO NOT call loadTrees().
    // It is internal to reserve_board.ts.
    await updateStatsUI();


    // Villa / Guardian UI
    await updateVillaStayUI();


    // Direct wallet balance
    const identity =
      getIdentity();


    if (
      identity &&
      identity.wallet
    ) {

      const balance =
        await fetchOLVMBalance(
          identity.wallet
        );


      if (olvBalance) {

        olvBalance.textContent =
          balance.toLocaleString(
            undefined,
            {
              maximumFractionDigits: 2,
            }
          );
      }
    }


    // Live ticker
    await updateLiveTicker();


    console.log(
      "[DASH] Refresh complete."
    );

  } catch (err) {

    console.error(
      "[DASH] Refresh failed:",
      err
    );
  }
}


win.refreshDashboard =
  refreshDashboard;


// ═════════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═════════════════════════════════════════════════════════════════════════════

export async function initLiveDash() {

  if (initialized) {

    console.log(
      "[LIVEDASH] Already initialized."
    );

    return;
  }


  initialized = true;


  console.log(
    "[LIVEDASH] Initializing..."
  );


  // ───────────────────────────────────────────────────────────────────────────
  // FIRST: SHOW SOMETHING IMMEDIATELY
  // ───────────────────────────────────────────────────────────────────────────
  //
  // This happens BEFORE waitForProgram().
  //
  // If Solana/RPC takes time, the dashboard still displays the real
  // non-market state rather than a blank ticker.
  // ───────────────────────────────────────────────────────────────────────────

  renderTickerFallback();


  // Start a non-blocking ticker update.
  //
  // If Solana is already ready this will quickly replace the fallback.
  // If it is not ready, the fallback remains visible.
  void updateLiveTicker();


  try {

    // ─────────────────────────────────────────────────────────────────────────
    // WAIT FOR ANCHOR PROGRAM
    // ─────────────────────────────────────────────────────────────────────────

    await waitForProgram();


    // ─────────────────────────────────────────────────────────────────────────
    // IDENTITY / WALLET
    // ─────────────────────────────────────────────────────────────────────────

    await updateIdentityBalanceUI();

    updateWalletConnectionUI();


    // ─────────────────────────────────────────────────────────────────────────
    // TREE / STATS
    // ─────────────────────────────────────────────────────────────────────────
    //
    // updateStatsUI() internally uses the public tree functions.
    // No direct loadTrees() call here.
    // ─────────────────────────────────────────────────────────────────────────

    await updateStatsUI();


    // ─────────────────────────────────────────────────────────────────────────
    // VILLA / GUARDIAN
    // ─────────────────────────────────────────────────────────────────────────

    await updateVillaStayUI();


    // ─────────────────────────────────────────────────────────────────────────
    // LIVE TICKER
    // ─────────────────────────────────────────────────────────────────────────

    await updateLiveTicker();


    // ─────────────────────────────────────────────────────────────────────────
    // SUPABASE REALTIME
    // ─────────────────────────────────────────────────────────────────────────

    subscribeToSensorData();

    subscribeToFieldSensorData();

    subscribeToTreeUpdates();


    // ─────────────────────────────────────────────────────────────────────────
    // CONNECT BUTTON
    // ─────────────────────────────────────────────────────────────────────────

    if (connectBtn) {

      connectBtn.addEventListener(
        "click",
        handleConnectClick
      );
    }


    // ─────────────────────────────────────────────────────────────────────────
    // CONNECTION EVENTS
    // ─────────────────────────────────────────────────────────────────────────

    window.addEventListener(
      "olivium:connected",
      async () => {

        console.log(
          "[LIVEDASH] Connected event received."
        );

        updateWalletConnectionUI();

        await refreshDashboard();
      }
    );


    window.addEventListener(
      "olivium:disconnected",
      async () => {

        console.log(
          "[LIVEDASH] Disconnected event received."
        );

        updateWalletConnectionUI();

        await refreshDashboard();
      }
    );


    window.addEventListener(
      "solana:connection-complete",
      async () => {

        console.log(
          "[LIVEDASH] Solana connection complete."
        );

        updateWalletConnectionUI();

        await refreshDashboard();
      }
    );


    // ─────────────────────────────────────────────────────────────────────────
    // PERIODIC DASHBOARD REFRESH
    // ─────────────────────────────────────────────────────────────────────────

    window.setInterval(
      async () => {

        try {

          await updateStatsUI();

          await updateVillaStayUI();

          await updateLiveTicker();

        } catch (err) {

          console.warn(
            "[LIVEDASH] Periodic refresh failed:",
            err
          );
        }

      },
      30_000
    );


    // ─────────────────────────────────────────────────────────────────────────
    // TICKER REFRESH
    // ─────────────────────────────────────────────────────────────────────────

    window.setInterval(
      async () => {

        try {

          await updateLiveTicker();

        } catch (err) {

          console.warn(
            "[TICKER] Periodic update failed:",
            err
          );
        }

      },
      60_000
    );


    console.log(
      "[LIVEDASH] Initialized successfully."
    );


  } catch (err) {

    console.error(
      "[LIVEDASH] Initialization failed:",
      err
    );


    // IMPORTANT:
    // Even if Anchor/Solana initialization fails,
    // leave the dashboard with a meaningful ticker.
    renderTickerFallback();


    initialized =
      false;
  }
}


// ═════════════════════════════════════════════════════════════════════════════
// DOM READY
// ═════════════════════════════════════════════════════════════════════════════

if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    () => {

      void initLiveDash();

    },
    {
      once: true,
    }
  );

} else {

  void initLiveDash();
}


// ═════════════════════════════════════════════════════════════════════════════
// FINAL WINDOW EXPORTS
// ═════════════════════════════════════════════════════════════════════════════

win.initLiveDash =
  initLiveDash;

win.refreshDashboard =
  refreshDashboard;

win.fetchOLVMBalance =
  fetchOLVMBalance;

win.fetchOLVBalance =
  fetchOLVBalance;

win.updateWalletConnectionUI =
  updateWalletConnectionUI;

win.subscribeToSensorData =
  subscribeToSensorData;

win.subscribeToFieldSensorData =
  subscribeToFieldSensorData;

win.subscribeToTreeUpdates =
  subscribeToTreeUpdates;

win.updateLiveTicker =
  updateLiveTicker;

win.latestSensorData =
  latestSensorData;


console.log(
  "[livedash.ts] ✅ Live dashboard module loaded."
);
