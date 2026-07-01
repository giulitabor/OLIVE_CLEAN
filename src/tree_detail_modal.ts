/**
 * tree_detail_modal.ts — Olivium DAO
 * ─────────────────────────────────────────────────────────────────────────────
 * Self-contained module for the Tree Detail Modal.
 *
 * FIXES applied vs original snippet
 * ──────────────────────────────────
 * 1. `sb` is imported from connection.ts instead of relying on window.sb.
 * 2. `_program` bare reference in getAllPositions → (window as any)._program.
 * 3. Status badge innerText no longer wipes the pulsing-dot markup — a dedicated
 *    <span> child is targeted instead (see HTML note below).
 * 4. Modal shows a loading skeleton before data arrives; "—" flash eliminated.
 * 5. `oracle-light` set call removed (no matching DOM element).
 * 6. Gallery falls back gracefully when all image loads fail.
 * 7. fetchFieldSensors / fetchOpenMeteo typed properly (no implicit any leaks).
 * 8. Tab switcher guard added so a missing tab silently no-ops instead of throwing.
 * 9. openTreeDetailModal accepts an optional pre-fetched `treeData` param so
 *    callers that already have Supabase data (e.g. tree-grid cards) skip an
 *    extra round-trip.
 *
 * HTML NOTE — status badge
 * ─────────────────────────
 * Change the badge markup in dashboard.html from:
 *
 *   <div id="tree-detail-status-badge" …>registered</div>
 *
 * to:
 *
 *   <div id="tree-detail-status-badge" …>
 *     <span id="tree-detail-status-text">registered</span>
 *   </div>
 *
 * This lets us update only the text while preserving the badge's own styling.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { sb } from "./connection";

// ─── tiny DOM helper ─────────────────────────────────────────────────────────

function setText(id: string, val: string): void {
  const el = document.getElementById(id);
  if (el) el.innerText = val;
}

function setWidth(id: string, pct: number): void {
  const el = document.getElementById(id) as HTMLElement | null;
  if (el) el.style.width = `${Math.min(Math.max(pct, 0), 100)}%`;
}

// ─── loading state helpers ───────────────────────────────────────────────────

const LOADING_IDS = [
  "tree-detail-name", "tree-detail-location", "tree-detail-field-id",
  "tree-detail-health", "tree-detail-age", "tree-detail-height",
  "tree-detail-variety", "tree-overview-shares", "tree-overview-pct",
  "tree-overview-sold-label", "tree-overview-total-label",
  "tree-detail-last-treatment", "tree-detail-treatment-type",
  "tree-detail-last-fertilizer", "tree-detail-fertilizer-type",
  "phys-age", "phys-height", "phys-circumference", "phys-diameter",
  "phys-crown", "phys-altitude", "phys-coords",
  "tree-detail-meta-id", "tree-detail-meta-field", "tree-detail-meta-onchain",
  "tree-detail-meta-mint", "tree-detail-meta-status", "tree-detail-meta-total",
  "tree-detail-meta-sold", "tree-detail-meta-available",
  "tree-detail-meta-variety", "tree-detail-meta-coords",
  "tree-detail-meta-updated",
];

function setLoadingState(): void {
  LOADING_IDS.forEach(id => setText(id, "…"));
  // Status badge text node
  setText("tree-detail-status-text", "…");
  setWidth("tree-overview-bar", 0);
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN MODAL OPEN
// ═══════════════════════════════════════════════════════════════════════════

export async function openTreeDetailModal(
  treeId: string,
  prefetchedData?: Record<string, any> | null
): Promise<void> {
  const modal = document.getElementById("tree-detail-modal");
  if (!modal) return;

  // Show immediately with loading placeholders
  modal.classList.remove("hidden");
  switchTreeDetailTab("overview");
  setLoadingState();

  // ── 1. Fetch Supabase + on-chain data in parallel ──────────────────────
  const [sbResult, onChainTrees] = await Promise.all([
    // Skip Supabase fetch if caller already passed data
    prefetchedData
      ? Promise.resolve({ data: prefetchedData, error: null })
      : sb.from("tree_metadata").select("*").eq("tree_id", treeId).single(),

    (async (): Promise<any[]> => {
      try {
        const p = (window as any)._program;
        return p ? await p.account.tree.all() : [];
      } catch {
        return [];
      }
    })(),
  ]);

  const d = sbResult?.data ?? null;

  // ── 2. Resolve on-chain account for this tree ──────────────────────────
  const onChain = (onChainTrees as any[]).find(
    t =>
      t.account?.treeId === treeId ||
      String(t.account?.treeId) === String(treeId)
  ) ?? null;

  const totalShares: number =
    onChain ? onChain.account.totalShares.toNumber() : (d?.total_shares ?? 1000);
  const sharesSold: number =
    onChain ? onChain.account.sharesSold.toNumber() : (d?.shares_sold ?? 0);
  const available = totalShares - sharesSold;
  const pct = totalShares > 0 ? Math.round((sharesSold / totalShares) * 100) : 0;
  const mintAddress: string =
    onChain?.account?.mint?.toBase58?.() ??
    d?.mint ??
    d?.on_chain_address ??
    "—";

  // ── 3. Hero image ──────────────────────────────────────────────────────
  const heroEl = document.getElementById("tree-detail-hero-img");
  if (heroEl) {
    const fallback =
      "https://raw.githubusercontent.com/kyngrick/olivium_photos/main/close1.jpeg";
    (heroEl as HTMLElement).style.backgroundImage =
      `url('${d?.photo_url || fallback}')`;
  }

  // ── 4. Overview tab fields ─────────────────────────────────────────────
  setText("tree-detail-name", d?.name || `Tree #${treeId}`);
  setText(
    "tree-detail-location",
    d?.field_id
      ? `Field ${d.field_id} · ${Number(d.latitude).toFixed(4)}, ${Number(d.longitude).toFixed(4)}`
      : "—"
  );
  setText("tree-detail-field-id", d?.field_id ?? "—");
  setText(
    "tree-detail-health",
    d?.health_score != null ? `${(d.health_score * 100).toFixed(0)}%` : "—"
  );

  // Status badge — targets the inner <span id="tree-detail-status-text"> only
  // so the pulsing dot in the parent <div> is preserved.
  setText("tree-detail-status-text", d?.status ?? "—");

  setText("tree-detail-age",     d?.age_years  != null ? `${d.age_years} yrs` : "—");
  setText("tree-detail-height",  d?.height_cm  != null ? `${d.height_cm} cm`  : "—");
  setText("tree-detail-variety", d?.variety    ?? "—");

  setText("tree-overview-shares",      `${sharesSold.toLocaleString()} / ${totalShares.toLocaleString()}`);
  setText("tree-overview-pct",         `${pct}%`);
  setText("tree-overview-sold-label",  `${sharesSold.toLocaleString()} sold`);
  setText("tree-overview-total-label", `${totalShares.toLocaleString()} total`);
  setWidth("tree-overview-bar", pct);

  setText("tree-detail-last-treatment",
    d?.last_treatment ? new Date(d.last_treatment).toLocaleDateString() : "—");
  setText("tree-detail-treatment-type", d?.treatment_type ?? "—");
  setText("tree-detail-last-fertilizer",
    d?.last_fertilizer ? new Date(d.last_fertilizer).toLocaleDateString() : "—");
  setText("tree-detail-fertilizer-type", d?.fertilizer_type ?? "—");

  // ── 5. Physical tab ────────────────────────────────────────────────────
  setText("phys-age",           d?.age_years        != null ? String(d.age_years)        : "—");
  setText("phys-height",        d?.height_cm        != null ? String(d.height_cm)        : "—");
  setText("phys-circumference", d?.circumference_cm != null ? String(d.circumference_cm) : "—");
  setText("phys-diameter",      d?.diameter_cm      != null ? String(d.diameter_cm)      : "—");
  setText("phys-crown",         d?.crown_spread_cm  != null ? String(d.crown_spread_cm)  : "—");
  setText("phys-altitude",      d?.altitude_m       != null ? String(d.altitude_m)       : "—");
  setText(
    "phys-coords",
    d?.latitude != null && d?.longitude != null
      ? `${d.latitude}, ${d.longitude}`
      : "—"
  );

  // ── 6. On-chain / metadata tab ─────────────────────────────────────────
  setText("tree-detail-meta-id",        treeId);
  setText("tree-detail-meta-field",     d?.field_id        ?? "—");
  setText("tree-detail-meta-onchain",   d?.on_chain_address ?? "—");
  setText("tree-detail-meta-mint",      mintAddress);
  setText("tree-detail-meta-status",    d?.status           ?? "—");
  setText("tree-detail-meta-total",     totalShares.toLocaleString());
  setText("tree-detail-meta-sold",      sharesSold.toLocaleString());
  setText("tree-detail-meta-available", available.toLocaleString());
  setText("tree-detail-meta-variety",   d?.variety ?? "—");
  setText(
    "tree-detail-meta-coords",
    d?.latitude != null ? `${d.latitude}, ${d.longitude}` : "—"
  );
  setText(
    "tree-detail-meta-updated",
    d?.updated_at ? new Date(d.updated_at).toLocaleString() : "—"
  );

  // ── 7. Gallery tab ─────────────────────────────────────────────────────
  const galleryGrid = document.getElementById("tree-detail-gallery-grid");
  if (galleryGrid) {
    const base =
      "https://raw.githubusercontent.com/kyngrick/olivium_photos/main";
    const photos: string[] = d?.photo_url
      ? [d.photo_url]
      : [
          `${base}/Tree%20F1-FR-001.jpeg`,
          `${base}/Tree%20F1-FR-002.jpeg`,
          `${base}/close1.jpeg`,
        ];

    galleryGrid.innerHTML = photos
      .map(
        url =>
          `<div class="relative rounded-xl overflow-hidden h-40 bg-stone-100">
             <img src="${url}"
                  class="w-full h-full object-cover"
                  onerror="this.parentElement.innerHTML='<span class=\\'flex items-center justify-center w-full h-full text-stone-300 text-xs\\'>No image</span>'" />
           </div>`
      )
      .join("");
  }

  // ── 8. Sensors + weather (can resolve after modal is visible) ──────────
  const fieldId = d?.field_id ?? null;
  const sensorData = await fetchFieldSensors(fieldId);

  const lat: number | null = sensorData?.lat ?? d?.latitude ?? null;
  const lon: number | null = sensorData?.lon ?? d?.longitude ?? null;

  if (lat != null && lon != null) {
    setText(
      "weather-coords-label",
      `${Number(lat).toFixed(4)}°N, ${Number(lon).toFixed(4)}°E`
    );
  }
  if (fieldId) setText("env-field-label", fieldId);

  const [weatherData] = await Promise.all([
    fetchOpenMeteo(lat, lon),
  ]);

  populateSensorUI(sensorData);
  populateWeatherUI(weatherData);
}
(window as any).openTreeDetailModal = openTreeDetailModal;

// ═══════════════════════════════════════════════════════════════════════════
// CLOSE
// ═══════════════════════════════════════════════════════════════════════════

export function closeTreeDetailModal(): void {
  document.getElementById("tree-detail-modal")?.classList.add("hidden");
}
(window as any).closeTreeDetailModal = closeTreeDetailModal;

// ═══════════════════════════════════════════════════════════════════════════
// TAB SWITCHER
// ═══════════════════════════════════════════════════════════════════════════

export function switchTreeDetailTab(tabName: string): void {
  // Hide all tab content panels
  document
    .querySelectorAll<HTMLElement>(".tree-detail-tab-content")
    .forEach(el => el.classList.add("hidden"));

  // Show the target panel (guard: silently no-op if not found)
  document.getElementById(`tree-detail-tab-${tabName}`)?.classList.remove("hidden");

  // Reset all tab buttons
  document.querySelectorAll<HTMLElement>(".tree-detail-tab").forEach(tab => {
    tab.classList.remove("active", "border-green-600", "text-green-600");
    tab.classList.add("border-transparent", "text-stone-500");
  });

  // Activate the matching tab button
  // Uses data-tab attribute (preferred) with onclick-string fallback for
  // existing markup that uses onclick="switchTreeDetailTab('overview')" style.
  const activeTab =
    document.querySelector<HTMLElement>(`.tree-detail-tab[data-tab="${tabName}"]`) ??
    Array.from(document.querySelectorAll<HTMLElement>(".tree-detail-tab")).find(t =>
      t.getAttribute("onclick")?.includes(`'${tabName}'`)
    ) ??
    null;

  if (activeTab) {
    activeTab.classList.add("active", "border-green-600", "text-green-600");
    activeTab.classList.remove("border-transparent", "text-stone-500");
  }
}
(window as any).switchTreeDetailTab = switchTreeDetailTab;

// ═══════════════════════════════════════════════════════════════════════════
// SENSOR FETCH (Supabase node_sensors table)
// ═══════════════════════════════════════════════════════════════════════════

async function fetchFieldSensors(fieldId: string | null): Promise<Record<string, any> | null> {
  if (!fieldId) return null;
  try {
    const { data, error } = await sb
      .from("node_sensors")
      .select("*")
      .eq("field_id", fieldId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("[SENSORS]", error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.error("[SENSORS]", err);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// WEATHER FETCH (Open-Meteo — no API key needed)
// ═══════════════════════════════════════════════════════════════════════════

async function fetchOpenMeteo(
  lat: number | null,
  lon: number | null
): Promise<Record<string, any> | null> {
  if (lat == null || lon == null) return null;
  try {
    const params = new URLSearchParams({
      latitude:  String(lat),
      longitude: String(lon),
      current: [
        "temperature_2m",
        "relative_humidity_2m",
        "wind_speed_10m",
        "surface_pressure",
        "rain",
        "uv_index",
        "shortwave_radiation",
      ].join(","),
      wind_speed_unit: "ms",
      timezone: "auto",
    });
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!res.ok) return null;
    const json = await res.json();
    return (json?.current as Record<string, any>) ?? null;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// UI POPULATORS
// ═══════════════════════════════════════════════════════════════════════════

function populateSensorUI(s: Record<string, any> | null): void {
  const NA = "—";

  if (!s) {
    [
      "oracle-soil-moisture", "oracle-soil-temp", "oracle-leaf-wetness",
      "oracle-uv", "oracle-co2", "oracle-wind", "oracle-rain", "oracle-humidity",
    ].forEach(id => setText(id, NA));
    setText("oracle-moisture-status", "No data");
    setText("oracle-last-update", "No sensor data");
    setWidth("oracle-moisture-bar", 0);
    return;
  }

  const moisture = s.soil_moisture != null ? Number(s.soil_moisture) : null;

  setText("oracle-soil-moisture",
    moisture !== null ? `${moisture.toFixed(1)}%` : NA);
  setText("oracle-moisture-status",
    moisture !== null ? (moisture > 50 ? "Optimal" : "Balanced") : "No data");
  setWidth("oracle-moisture-bar", moisture !== null ? moisture : 0);

  setText("oracle-soil-temp",
    s.temperature != null ? `${Number(s.temperature).toFixed(1)}°C` : NA);
  setText("oracle-leaf-wetness",
    s.leaf_wetness != null ? Number(s.leaf_wetness).toFixed(2) : NA);
  setText("oracle-co2",
    s.co2 != null ? `${Number(s.co2).toFixed(1)} ppm` : NA);
  setText("oracle-wind",
    s.wind_speed != null ? `${Number(s.wind_speed).toFixed(1)} m/s` : NA);
  setText("oracle-rain",
    s.rain_rate != null ? `${Number(s.rain_rate).toFixed(2)} mm/hr` : NA);
  setText("oracle-humidity",
    s.humidity != null ? `${Number(s.humidity).toFixed(1)}%` : NA);
  setText("oracle-uv",
    s.uv_index != null ? String(s.uv_index) : NA);
  setText("oracle-last-update",
    s.created_at
      ? new Date(s.created_at).toLocaleTimeString()
      : new Date().toLocaleTimeString());
}

function populateWeatherUI(w: Record<string, any> | null): void {
  const NA = "—";

  if (!w) {
    ["weather-temp", "weather-wind", "weather-humidity",
     "weather-pressure", "weather-rain", "weather-uv", "weather-solar"]
      .forEach(id => setText(id, NA));
    return;
  }

  const uvRaw = w.uv_index != null ? Number(w.uv_index) : null;
  const uvLabel = uvRaw !== null
    ? `${uvRaw} (${uvRaw <= 2 ? "Low" : uvRaw <= 5 ? "Moderate" : uvRaw <= 7 ? "High" : "Very High"})`
    : NA;

  setText("weather-temp",     w.temperature_2m    !== undefined ? `${w.temperature_2m}°C`      : NA);
  setText("weather-wind",     w.wind_speed_10m    !== undefined ? `${w.wind_speed_10m} m/s`     : NA);
  setText("weather-humidity", w.relative_humidity_2m !== undefined ? `${w.relative_humidity_2m}%` : NA);
  setText("weather-pressure", w.surface_pressure  !== undefined ? `${w.surface_pressure} hPa`   : NA);
  setText("weather-rain",     w.rain              !== undefined ? `${w.rain} mm`                : NA);
  setText("weather-uv",       uvLabel);
  setText("weather-solar",    w.shortwave_radiation !== undefined ? `${w.shortwave_radiation} W/m²` : NA);
}
