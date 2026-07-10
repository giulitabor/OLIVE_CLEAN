/**
 * dashboard.ts — Olivium DAO dashboard
 * Wires the dashboard markup to real on-chain reads (dashboard-data.ts) and
 * wallet identity (connection.ts). Re-renders on olivium:connected /
 * olivium:disconnected instead of assuming a connection at load time.
 */

import { getIdentity, getActiveWallet } from "./connection";
import {
  fetchPortfolio,
  fetchEntitlement,
  fetchOilAllocation,
  requestOilClaim,
  requestSellToDao,
  fetchVillaAvailability,
  requestVillaBooking,
} from "./dashboard-data";

/* ===== Tier config (mirrors pro.js — used here only to label the OLV card) */

const TIERS = [
  { name: "Seedling", minOlv: 0 },
  { name: "Sapling", minOlv: 100 },
  { name: "Evergreen", minOlv: 500 },
  { name: "Ancient Oak", minOlv: 2000 },
  { name: "Elder Grove", minOlv: 10000 },
];

function tierNameFor(olv: number): string {
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (olv >= TIERS[i].minOlv) return TIERS[i].name;
  }
  return TIERS[0].name;
}

/* ===== Formatting helpers ===== */

const fmtInt = (n: number) => Math.round(n).toLocaleString("en-US");
const fmtDecimal = (n: number, places = 2) => n.toFixed(places);
const fmtSol = (n: number) => `${n.toFixed(2)} SOL`;
const fmtOlv = (n: number) => `${fmtInt(n)} OLV`;

const $ = (id: string) => document.getElementById(id);

/* ===== Villa: track selected nights across re-renders ===== */

let selectedNights = new Set<string>();

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysFromNowISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/* ===== Render ===== */

async function renderWallet() {
  const identity = getIdentity();
  const connected = identity.type !== "guest";

  const statusEl = $("wallet-status");
  const addrEl = $("wallet-address");
  const btnEl = $("btn-wallet") as HTMLButtonElement | null;

  if (statusEl) statusEl.textContent = connected ? "Wallet Connected" : "Not connected";
  if (addrEl) addrEl.textContent = connected ? identity.label : "—";
  if (btnEl) {
    btnEl.textContent = connected ? "Disconnect" : "Connect Wallet";
  }
}

async function renderPortfolio() {
  const wallet = getActiveWallet();
  if (!wallet) {
    setText("metric-mignole", "—");
    setText("metric-olvm", "—");
    setText("metric-sol", "—");
    setText("metric-olv-tier", "—");
    setText("metric-tier-name", "—");
    return;
  }

  const portfolio = await fetchPortfolio();
  setText("metric-mignole", fmtInt(portfolio.mignoleUnits));
  setText("metric-olvm", fmtOlv(portfolio.olvTokens));
  setText("metric-sol", fmtSol(portfolio.solBalance));
  setText("metric-olv-tier", fmtOlv(portfolio.olvTokens));
  setText("metric-tier-name", tierNameFor(portfolio.olvTokens));
}

async function renderAssets() {
  const wallet = getActiveWallet();
  if (!wallet) {
    setText("asset-mignole", "—");
    setText("asset-oil", "—");
    setText("asset-carbon", "—");
    return;
  }

  const [portfolio, entitlement] = await Promise.all([fetchPortfolio(), fetchEntitlement()]);
  setText("asset-mignole", fmtInt(portfolio.mignoleUnits));
  setText("asset-oil", `${fmtDecimal(entitlement.oilLitresEntitled)} L`);
  setText("asset-carbon", `${fmtDecimal(entitlement.carbonTonnes)} tCO₂`);
}

async function renderOilAllocation() {
  const wallet = getActiveWallet();
  if (!wallet) {
    setText("oil-claim", "Connect wallet");
    setText("oil-entitled-note", "—");
    return;
  }

  const allocation = await fetchOilAllocation();
  setText("oil-claim", `${fmtDecimal(allocation.available)} Litres`);
  setText(
    "oil-entitled-note",
    `Entitled: ${fmtDecimal(allocation.entitled)} L · Pending: ${fmtDecimal(allocation.pending)} L`
  );
}

async function renderVilla() {
  const villa = await fetchVillaAvailability(todayISO(), daysFromNowISO(30));
  setText("villa-nights", `${villa.availableNights} Nights`);

  const container = $("villa-days");
  if (!container) return;
  container.innerHTML = "";

  villa.days.forEach((isoDate: string) => {
    const day = new Date(isoDate).getDate();
    const el = document.createElement("div");
    el.className = "day" + (selectedNights.has(isoDate) ? " selected" : "");
    el.textContent = String(day);
    el.dataset.date = isoDate;
    el.addEventListener("click", () => {
      if (selectedNights.has(isoDate)) {
        selectedNights.delete(isoDate);
      } else {
        selectedNights.add(isoDate);
      }
      renderVilla(); // cheap full re-render; fine at this scale
    });
    container.appendChild(el);
  });
}

function setText(id: string, text: string) {
  const el = $(id);
  if (el) el.textContent = text;
}

async function renderDashboard() {
  await Promise.all([renderWallet(), renderPortfolio(), renderAssets(), renderOilAllocation(), renderVilla()]);
}

/* ===== Action handlers ===== */

function showError(message: string) {
  // TODO: swap for a proper toast component shared with pro.js's showToast
  alert(message);
}

function bindActions() {
  $("btn-wallet")?.addEventListener("click", async () => {
    try {
      if (getActiveWallet()) {
        await (window as any).disconnectWallet();
      } else {
        await (window as any).connectWallet();
      }
    } catch (err: any) {
      showError(err.message || "Wallet connection failed");
    }
  });

  $("btn-arcade")?.addEventListener("click", () => {
    // TODO: route to arcade section/page — no arcade backend exists yet
    console.log("enter arcade clicked");
  });

  // Claim delivery: toggle the form, submit writes to oil_transactions
  $("btn-claim")?.addEventListener("click", () => {
    $("sell-form")?.classList.add("hidden");
    $("claim-form")?.classList.toggle("hidden");
  });

  $("btn-claim-submit")?.addEventListener("click", async () => {
    const litres = Number((($("claim-litres") as HTMLInputElement)?.value) || 0);
    const name = (($("claim-name") as HTMLInputElement)?.value || "").trim();
    const address = (($("claim-address") as HTMLTextAreaElement)?.value || "").trim();

    if (!litres || litres <= 0) return showError("Enter a litres amount");
    if (!name || !address) return showError("Shipping name and address are required");

    try {
      await requestOilClaim(litres, name, { raw: address });
      $("claim-form")?.classList.add("hidden");
      await renderOilAllocation();
      showError("Claim submitted — you'll be notified once it ships."); // TODO: success toast, not alert
    } catch (err: any) {
      showError(err.message || "Claim failed");
    }
  });

  // Sell to DAO: toggle the form, submit writes to oil_transactions
  $("btn-sell")?.addEventListener("click", () => {
    $("claim-form")?.classList.add("hidden");
    $("sell-form")?.classList.toggle("hidden");
  });

  $("btn-sell-submit")?.addEventListener("click", async () => {
    const litres = Number((($("sell-litres") as HTMLInputElement)?.value) || 0);
    const currency = (($("sell-currency") as HTMLSelectElement)?.value || "OLVM") as "OLVM" | "SOL";

    if (!litres || litres <= 0) return showError("Enter a litres amount");

    try {
      await requestSellToDao(litres, currency);
      $("sell-form")?.classList.add("hidden");
      await renderOilAllocation();
      showError("Sell request submitted — payout is pending a rate quote."); // see open question on pricing
    } catch (err: any) {
      showError(err.message || "Sell request failed");
    }
  });

  // Villa booking
  $("btn-book")?.addEventListener("click", async () => {
    const email = (($("villa-email") as HTMLInputElement)?.value || "").trim();
    if (selectedNights.size === 0) return showError("Select at least one night");
    if (!email) return showError("Enter an email for the booking confirmation");

    try {
      await requestVillaBooking(Array.from(selectedNights), email);
      selectedNights = new Set();
      await renderVilla();
      showError("Booking confirmed — check your email."); // TODO: success toast, not alert
    } catch (err: any) {
      showError(err.message || "Booking failed");
    }
  });
}

/* ===== Boot ===== */

window.addEventListener("olivium:connected", () => renderDashboard());
window.addEventListener("olivium:disconnected", () => renderDashboard());

bindActions();
renderDashboard();
