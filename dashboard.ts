/**
 * dashboard.ts — Olivium DAO dashboard
 *
 * Wires the dashboard markup to real on-chain reads
 * (dashboard-data.ts), wallet identity (connection.ts),
 * and live market feeds.
 *
 * Market feeds:
 *   - OLVM      → DexScreener
 *   - Carbon    → Carbonmark / ICR-48
 *   - Olive oil → /api/olive-oil proxy
 *
 * Market ticker refreshes automatically every 60 seconds.
 */

import {
  getIdentity,
  getActiveWallet,
} from "./src/connection";

import {
  fetchPortfolio,
  fetchEntitlement,
  fetchOilAllocation,
  requestOilClaim,
  requestSellToDao,
  fetchVillaAvailability,
  requestVillaBooking,
  fetchLiveMarketFeeds,
} from "./dashboard-data";

/* ===== Tier config ================================================ */

const TIERS = [
  {
    name: "Seedling",
    minOlv: 0,
  },
  {
    name: "Sapling",
    minOlv: 100,
  },
  {
    name: "Evergreen",
    minOlv: 500,
  },
  {
    name: "Ancient Oak",
    minOlv: 2000,
  },
  {
    name: "Elder Grove",
    minOlv: 10000,
  },
];

function tierNameFor(
  olv: number
): string {
  for (
    let i = TIERS.length - 1;
    i >= 0;
    i--
  ) {
    if (
      olv >= TIERS[i].minOlv
    ) {
      return TIERS[i].name;
    }
  }

  return TIERS[0].name;
}

/* ===== Formatting helpers ======================================== */

const fmtInt = (n: number) =>
  Math.round(n).toLocaleString(
    "en-US"
  );

const fmtDecimal = (
  n: number,
  places = 2
) =>
  n.toFixed(places);

const fmtSol = (n: number) =>
  `${n.toFixed(2)} SOL`;

const fmtOlv = (n: number) =>
  `${fmtInt(n)} OLV`;

const $ = (id: string) =>
  document.getElementById(id);

/* ===== Villa: selected nights ==================================== */

let selectedNights =
  new Set<string>();

function todayISO(): string {
  return new Date()
    .toISOString()
    .slice(0, 10);
}

function daysFromNowISO(
  days: number
): string {
  const d = new Date();

  d.setDate(
    d.getDate() + days
  );

  return d.toISOString()
    .slice(0, 10);
}

/* ================================================================= */
/* WALLET                                                            */
/* ================================================================= */

async function renderWallet() {
  const identity =
    getIdentity();

  const connected =
    identity.type !== "guest";

  const statusEl =
    $("wallet-status");

  const addrEl =
    $("wallet-address");

  const btnEl =
    $("btn-wallet") as
      | HTMLButtonElement
      | null;

  if (statusEl) {
    statusEl.textContent =
      connected
        ? "Wallet Connected"
        : "Not connected";
  }

  if (addrEl) {
    addrEl.textContent =
      connected
        ? identity.label
        : "—";
  }

  if (btnEl) {
    btnEl.textContent =
      connected
        ? "Disconnect"
        : "Connect Wallet";
  }
}

/* ================================================================= */
/* PORTFOLIO                                                         */
/* ================================================================= */

async function renderPortfolio() {
  const wallet =
    getActiveWallet();

  if (!wallet) {
    setText(
      "metric-mignole",
      "—"
    );

    setText(
      "metric-olvm",
      "—"
    );

    setText(
      "metric-sol",
      "—"
    );

    setText(
      "metric-olv-tier",
      "—"
    );

    setText(
      "metric-tier-name",
      "—"
    );

    return;
  }

  const portfolio =
    await fetchPortfolio();

  setText(
    "metric-mignole",
    fmtInt(
      portfolio.mignoleUnits
    )
  );

  setText(
    "metric-olvm",
    fmtOlv(
      portfolio.olvTokens
    )
  );

  setText(
    "metric-sol",
    fmtSol(
      portfolio.solBalance
    )
  );

  setText(
    "metric-olv-tier",
    fmtOlv(
      portfolio.olvTokens
    )
  );

  setText(
    "metric-tier-name",
    tierNameFor(
      portfolio.olvTokens
    )
  );
}

/* ================================================================= */
/* ASSETS                                                            */
/* ================================================================= */

async function renderAssets() {
  const wallet =
    getActiveWallet();

  if (!wallet) {
    setText(
      "asset-mignole",
      "—"
    );

    setText(
      "asset-oil",
      "—"
    );

    setText(
      "asset-carbon",
      "—"
    );

    return;
  }

  const [
    portfolio,
    entitlement,
  ] = await Promise.all([
    fetchPortfolio(),
    fetchEntitlement(),
  ]);

  setText(
    "asset-mignole",
    fmtInt(
      portfolio.mignoleUnits
    )
  );

  setText(
    "asset-oil",
    `${fmtDecimal(
      entitlement.oilLitresEntitled
    )} L`
  );

  setText(
    "asset-carbon",
    `${fmtDecimal(
      entitlement.carbonTonnes
    )} tCO₂`
  );
}

/* ================================================================= */
/* OIL ALLOCATION                                                    */
/* ================================================================= */

async function renderOilAllocation() {
  const wallet =
    getActiveWallet();

  if (!wallet) {
    setText(
      "oil-claim",
      "Connect wallet"
    );

    setText(
      "oil-entitled-note",
      "—"
    );

    return;
  }

  const allocation =
    await fetchOilAllocation();

  setText(
    "oil-claim",
    `${fmtDecimal(
      allocation.available
    )} Litres`
  );

  setText(
    "oil-entitled-note",
    `Entitled: ${fmtDecimal(
      allocation.entitled
    )} L · Pending: ${fmtDecimal(
      allocation.pending
    )} L`
  );
}

/* ================================================================= */
/* VILLA                                                             */
/* ================================================================= */

async function renderVilla() {
  const villa =
    await fetchVillaAvailability(
      todayISO(),
      daysFromNowISO(30)
    );

  setText(
    "villa-nights",
    `${villa.availableNights} Nights`
  );

  const container =
    $("villa-days");

  if (!container) {
    return;
  }

  container.innerHTML = "";

  villa.days.forEach(
    (isoDate: string) => {
      const day =
        new Date(
          isoDate
        ).getDate();

      const el =
        document.createElement(
          "div"
        );

      el.className =
        "day" +
        (
          selectedNights.has(
            isoDate
          )
            ? " selected"
            : ""
        );

      el.textContent =
        String(day);

      el.dataset.date =
        isoDate;

      el.addEventListener(
        "click",
        () => {
          if (
            selectedNights.has(
              isoDate
            )
          ) {
            selectedNights.delete(
              isoDate
            );
          } else {
            selectedNights.add(
              isoDate
            );
          }

          renderVilla();
        }
      );

      container.appendChild(
        el
      );
    }
  );
}

/* ================================================================= */
/* HELPERS                                                           */
/* ================================================================= */

function setText(
  id: string,
  text: string
) {
  const el = $(id);

  if (el) {
    el.textContent = text;
  }
}

function showError(
  message: string
) {
  alert(message);
}

/* ================================================================= */
/* LIVE MARKET TICKER                                                */
/* ================================================================= */

let marketRefreshTimer:
  number | null = null;

let marketRefreshRunning =
  false;

function formatSignedPercent(
  value: number
): string {
  if (!Number.isFinite(value)) {
    return "—";
  }

  if (value > 0) {
    return `▲${value.toFixed(1)}%`;
  }

  if (value < 0) {
    return `▼${Math.abs(
      value
    ).toFixed(1)}%`;
  }

  return "—0.0%";
}

function formatUsd(
  value: number
): string {
  if (
    !Number.isFinite(value) ||
    value <= 0
  ) {
    return "—";
  }

  if (value < 0.01) {
    return `$${value.toFixed(6)}`;
  }

  if (value < 1) {
    return `$${value.toFixed(4)}`;
  }

  return `$${value.toFixed(2)}`;
}

function formatEuro(
  value: number
): string {
  if (
    !Number.isFinite(value) ||
    value <= 0
  ) {
    return "—";
  }

  return `€${value.toFixed(2)}`;
}

function buildTickerItem(
  text: string,
  hidden = false
): HTMLSpanElement {
  const span =
    document.createElement(
      "span"
    );

  span.textContent = text;

  if (hidden) {
    span.setAttribute(
      "aria-hidden",
      "true"
    );
  }

  return span;
}

function updateTicker(
  market: any
) {
  const track =
    $("ticker-track");

  if (!track) {
    return;
  }

  const fragment =
    document.createDocumentFragment();

  const olvm =
    market?.olvm;

  const carbon =
    market?.carbon;

  const oliveOil =
    market?.oliveOil;

  const olvmText =
    olvm?.priceUsd > 0
      ? `◎ OLVM ${formatUsd(
          olvm.priceUsd
        )} ${formatSignedPercent(
          olvm.change24h
        )}`
      : "◎ OLVM —";

  const oilText =
    oliveOil?.priceEurPerLitre > 0
      ? `🫒 EXTRA VIRGIN OIL ${formatEuro(
          oliveOil.priceEurPerLitre
        )}/L`
      : "🫒 EXTRA VIRGIN OIL —";

  const carbonText =
    carbon?.priceUsd > 0
      ? `🌿 CARBON $${carbon.priceUsd.toFixed(
          2
        )}/t`
      : "🌿 CARBON —";

  const villaText =
    $("villa-nights")
      ?.textContent ||
    "—";

  const items = [
    oilText,
    olvmText,
    carbonText,
    "🌳 240 Trees · Growing Phase",
    `🏡 Villa: ${villaText}`,
    "💎 DAO Treasury Healthy",
  ];

  /*
   * Duplicate the sequence so the existing
   * CSS ticker animation remains continuous.
   */
  for (let copy = 0; copy < 2; copy++) {
    items.forEach(
      (item) => {
        fragment.appendChild(
          buildTickerItem(
            item,
            copy === 1
          )
        );
      }
    );
  }

  track.replaceChildren(
    fragment
  );
}

async function refreshMarketTicker() {
  if (
    marketRefreshRunning
  ) {
    return;
  }

  marketRefreshRunning =
    true;

  try {
    const market =
      await fetchLiveMarketFeeds();

    updateTicker(market);

    /*
     * Keep failures isolated. If one source is unavailable,
     * the other live feeds still update.
     */
    if (
      market.errors?.olvm
    ) {
      console.warn(
        "OLVM feed:",
        market.errors.olvm
      );
    }

    if (
      market.errors?.carbon
    ) {
      console.warn(
        "Carbonmark feed:",
        market.errors.carbon
      );
    }

    if (
      market.errors?.oliveOil
    ) {
      console.warn(
        "Olive oil feed:",
        market.errors.oliveOil
      );
    }
  } catch (err) {
    console.warn(
      "Market ticker refresh failed:",
      err
    );
  } finally {
    marketRefreshRunning =
      false;
  }
}

function startMarketTicker() {
  /*
   * Load immediately.
   */
  refreshMarketTicker();

  /*
   * Then refresh every 60 seconds.
   */
  if (
    marketRefreshTimer !== null
  ) {
    window.clearInterval(
      marketRefreshTimer
    );
  }

  marketRefreshTimer =
    window.setInterval(
      () => {
        refreshMarketTicker();
      },
      60_000
    );
}

/* ================================================================= */
/* FULL DASHBOARD                                                    */
/* ================================================================= */

async function renderDashboard() {
  await Promise.all([
    renderWallet(),
    renderPortfolio(),
    renderAssets(),
    renderOilAllocation(),
    renderVilla(),
  ]);

  /*
   * Villa availability is already live from Supabase,
   * so rebuild the ticker after it renders.
   */
  await refreshMarketTicker();
}

/* ================================================================= */
/* ACTION HANDLERS                                                    */
/* ================================================================= */

function bindActions() {
  /* ── Wallet ───────────────────────────────────────────────────── */

  $("btn-wallet")?.addEventListener(
    "click",
    async () => {
      try {
        if (
          getActiveWallet()
        ) {
          await (
            window as any
          ).disconnectWallet();
        } else {
          await (
            window as any
          ).connectWallet();
        }
      } catch (err: any) {
        showError(
          err.message ||
            "Wallet connection failed"
        );
      }
    }
  );

  /* ── Arcade ───────────────────────────────────────────────────── */

  $("btn-arcade")?.addEventListener(
    "click",
    () => {
      console.log(
        "enter arcade clicked"
      );
    }
  );

  /* ── Claim form ───────────────────────────────────────────────── */

  $("btn-claim")?.addEventListener(
    "click",
    () => {
      $("sell-form")
        ?.classList.add(
          "hidden"
        );

      $("claim-form")
        ?.classList.toggle(
          "hidden"
        );
    }
  );

  $("btn-claim-submit")
    ?.addEventListener(
      "click",
      async () => {
        const litres =
          Number(
            (
              $(
                "claim-litres"
              ) as HTMLInputElement
            )?.value || 0
          );

        const name =
          (
            $(
              "claim-name"
            ) as HTMLInputElement
          )?.value
            ?.trim() || "";

        const address =
          (
            $(
              "claim-address"
            ) as HTMLTextAreaElement
          )?.value
            ?.trim() || "";

        if (
          !litres ||
          litres <= 0
        ) {
          return showError(
            "Enter a litres amount"
          );
        }

        if (
          !name ||
          !address
        ) {
          return showError(
            "Shipping name and address are required"
          );
        }

        try {
          await requestOilClaim(
            litres,
            name,
            {
              raw: address,
            }
          );

          $("claim-form")
            ?.classList.add(
              "hidden"
            );

          await renderOilAllocation();

          showError(
            "Claim submitted — you'll be notified once it ships."
          );
        } catch (
          err: any
        ) {
          showError(
            err.message ||
              "Claim failed"
          );
        }
      }
    );

  /* ── Sell form ────────────────────────────────────────────────── */

  $("btn-sell")?.addEventListener(
    "click",
    () => {
      $("claim-form")
        ?.classList.add(
          "hidden"
        );

      $("sell-form")
        ?.classList.toggle(
          "hidden"
        );
    }
  );

  $("btn-sell-submit")
    ?.addEventListener(
      "click",
      async () => {
        const litres =
          Number(
            (
              $(
                "sell-litres"
              ) as HTMLInputElement
            )?.value || 0
          );

        const currency =
          (
            $(
              "sell-currency"
            ) as HTMLSelectElement
          )?.value ||
          "OLVM";

        if (
          !litres ||
          litres <= 0
        ) {
          return showError(
            "Enter a litres amount"
          );
        }

        try {
          await requestSellToDao(
            litres,
            currency as
              | "OLVM"
              | "SOL"
          );

          $("sell-form")
            ?.classList.add(
              "hidden"
            );

          await renderOilAllocation();

          showError(
            "Sell request submitted — payout is pending a rate quote."
          );
        } catch (
          err: any
        ) {
          showError(
            err.message ||
              "Sell request failed"
          );
        }
      }
    );

  /* ── Villa booking ────────────────────────────────────────────── */

  $("btn-book")?.addEventListener(
    "click",
    async () => {
      const email =
        (
          $(
            "villa-email"
          ) as HTMLInputElement
        )?.value
          ?.trim() || "";

      if (
        selectedNights.size ===
        0
      ) {
        return showError(
          "Select at least one night"
        );
      }

      if (!email) {
        return showError(
          "Enter an email for the booking confirmation"
        );
      }

      try {
        await requestVillaBooking(
          Array.from(
            selectedNights
          ),
          email
        );

        selectedNights =
          new Set();

        await renderVilla();

        await refreshMarketTicker();

        showError(
          "Booking confirmed — check your email."
        );
      } catch (
        err: any
      ) {
        showError(
          err.message ||
            "Booking failed"
        );
      }
    }
  );
}

/* ================================================================= */
/* BOOT                                                              */
/* ================================================================= */

window.addEventListener(
  "olivium:connected",
  () => {
    renderDashboard();
  }
);

window.addEventListener(
  "olivium:disconnected",
  () => {
    renderDashboard();
  }
);

bindActions();
renderDashboard();
startMarketTicker();
