/**
 * weatherEngine.ts
 *
 * Multi-source weather consensus engine with smart throttling
 * 
 * FIXES:
 * - API keys removed from frontend (now called via /api/weather proxy)
 * - Olive AI farm intelligence added (spray recommendations, disease risk)
 * - Caching improved
 */

// ══════════════════════════════════════════════════════════════════════════════
// THROTTLER - Prevents API abuse and handles rate limits
// ══════════════════════════════════════════════════════════════════════════════

class WeatherThrottler {
  private blockedSources: Set<string> = new Set();
  private lastFetch: Map<string, number> = new Map();
  private minInterval = 60000; // 1 minute between calls per source

  isBlocked(source: string): boolean {
    return this.blockedSources.has(source);
  }

  blockPermanently(source: string): void {
    console.warn(`[WEATHER] ${source} permanently blocked (rate limited)`);
    this.blockedSources.add(source);
  }

  canFetch(source: string): boolean {
    if (this.blockedSources.has(source)) return false;

    const lastTime = this.lastFetch.get(source) || 0;
    const now = Date.now();

    if (now - lastTime < this.minInterval) {
      console.log(`[WEATHER] ${source} throttled (${Math.round((this.minInterval - (now - lastTime)) / 1000)}s remaining)`);
      return false;
    }

    return true;
  }

  recordFetch(source: string): void {
    this.lastFetch.set(source, Date.now());
  }

  unblock(source: string): void {
    this.blockedSources.delete(source);
    console.log(`[WEATHER] ${source} unblocked`);
  }
}

const Throttler = new WeatherThrottler();

// ══════════════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════════════

export interface WeatherConsensus {
  temperature: number;
  humidity: number;
  windSpeed: number;
  pressure: number;
  rainProb: number;
  uvIndex: number;
  cloudCover: number;
  sources: string[];
  confidence: number;
  timestamp: Date;
}

export interface ForecastDay {
  date: Date;
  tempMin: number;
  tempMax: number;
  rainProb: number;
  uvIndex: number;
  condition: string;
}

export interface FarmIntelligence {
  sprayWindow: {
    ideal: boolean;
    reason: string;
    recommendation: 'Spray Now' | 'Wait' | 'Avoid' | 'Optimal';
  };
  diseaseRisk: {
    level: 'Low' | 'Medium' | 'High';
    reason: string;
  };
  harvestReadiness: {
    status: 'Too Early' | 'Approaching' | 'Ready' | 'Late';
    daysToHarvest: number;
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// ✅ FIXED: Calls Vercel API endpoint (key hidden on server)
// ══════════════════════════════════════════════════════════════════════════════

export async function fetchWeatherConsensus(lat: number = 43.0833, lon: number = 10.5333): Promise<WeatherConsensus> {
  // ✅ API key is on the server — call our own endpoint
  const response = await fetch(`/api/weather?lat=${lat}&lon=${lon}`);
  
  if (!response.ok) {
    throw new Error(`Weather API error: ${response.status}`);
  }

  return await response.json();
}

// ══════════════════════════════════════════════════════════════════════════════
// FORECAST (5-DAY)
// ══════════════════════════════════════════════════════════════════════════════

export async function fetch5DayForecast(
  lat: number = 43.0833,
  lon: number = 10.5333
): Promise<ForecastDay[]> {
  // ✅ Also proxied through our API
  const response = await fetch(`/api/forecast?lat=${lat}&lon=${lon}`);

  if (!response.ok) {
    throw new Error(`Forecast API error: ${response.status}`);
  }

  return await response.json();
}

// ══════════════════════════════════════════════════════════════════════════════
// FARM INTELLIGENCE — 🧠 OLIVE AI
// ══════════════════════════════════════════════════════════════════════════════

export function analyzeFarmConditions(weather: WeatherConsensus): FarmIntelligence {
  // Spray Window Analysis
  let sprayReason = '';
  let sprayRecommendation: 'Spray Now' | 'Wait' | 'Avoid' | 'Optimal' = 'Wait';

  const windOk = weather.windSpeed < 3; // m/s
  const rainOk = weather.rainProb < 10; // %
  const tempOk = weather.temperature > 10 && weather.temperature < 30;

  if (weather.rainProb > 40) {
    sprayReason = 'Rain expected — spray would wash off';
    sprayRecommendation = 'Avoid';
  } else if (weather.humidity > 70 && weather.temperature > 20) {
    sprayReason = 'High humidity + warmth = fungal risk — wait for drier conditions';
    sprayRecommendation = 'Wait';
  } else if (windOk && rainOk && tempOk) {
    sprayReason = 'Ideal conditions: low wind, no rain, good temperature';
    sprayRecommendation = 'Optimal';
  } else if (windOk && rainOk) {
    sprayReason = 'Good conditions — temperature not optimal but acceptable';
    sprayRecommendation = 'Spray Now';
  } else {
    sprayReason = 'Wind too strong or rain expected — wait';
    sprayRecommendation = 'Wait';
  }

  // Disease Risk Analysis
  let diseaseRisk: 'Low' | 'Medium' | 'High' = 'Low';
  let diseaseReason = '';

  if (weather.humidity > 75 && weather.temperature > 18) {
    diseaseRisk = 'High';
    diseaseReason = 'Warm + humid — ideal for fungal development (Olive Leaf Spot, Peacock Spot)';
  } else if (weather.humidity > 65 && weather.temperature > 15) {
    diseaseRisk = 'Medium';
    diseaseReason = 'Moderate humidity — monitor for early signs of disease';
  } else {
    diseaseRisk = 'Low';
    diseaseReason = 'Current conditions not favorable for disease development';
  }

  // Harvest Readiness (based on season)
  const now = new Date();
  const month = now.getMonth();
  const day = now.getDate();

  let harvestStatus: 'Too Early' | 'Approaching' | 'Ready' | 'Late' = 'Too Early';
  let daysToHarvest = 0;

  if (month >= 9 && month <= 11) {
    // Harvest season (October-November)
    const harvestStart = new Date(now.getFullYear(), 9, 1); // Oct 1
    const harvestEnd = new Date(now.getFullYear(), 10, 30); // Nov 30

    if (now >= harvestStart && now <= harvestEnd) {
      harvestStatus = 'Ready';
      daysToHarvest = 0;
    } else if (now < harvestStart) {
      harvestStatus = 'Approaching';
      daysToHarvest = Math.ceil((harvestStart.getTime() - now.getTime()) / 86400000);
    } else {
      harvestStatus = 'Late';
      daysToHarvest = 0;
    }
  } else {
    harvestStatus = 'Too Early';
    const nextHarvest = new Date(now.getFullYear(), 9, 1);
    daysToHarvest = Math.ceil((nextHarvest.getTime() - now.getTime()) / 86400000);
  }

  return {
    sprayWindow: {
      ideal: sprayRecommendation === 'Optimal' || sprayRecommendation === 'Spray Now',
      reason: sprayReason,
      recommendation: sprayRecommendation,
    },
    diseaseRisk: {
      level: diseaseRisk,
      reason: diseaseReason,
    },
    harvestReadiness: {
      status: harvestStatus,
      daysToHarvest: Math.max(0, daysToHarvest),
    },
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// CACHING
// ══════════════════════════════════════════════════════════════════════════════

let weatherCache: WeatherConsensus | null = null;
let forecastCache: ForecastDay[] | null = null;
let lastWeatherFetch = 0;
let lastForecastFetch = 0;

const CACHE_DURATION_MS = 300000; // 5 minutes

export async function getWeather(): Promise<WeatherConsensus> {
  const now = Date.now();

  if (weatherCache && (now - lastWeatherFetch) < CACHE_DURATION_MS) {
    console.log('[WEATHER] Using cached data');
    return weatherCache;
  }

  weatherCache = await fetchWeatherConsensus();
  lastWeatherFetch = now;
  return weatherCache;
}

export async function getForecast(): Promise<ForecastDay[]> {
  const now = Date.now();

  if (forecastCache && (now - lastForecastFetch) < CACHE_DURATION_MS) {
    console.log('[FORECAST] Using cached data');
    return forecastCache;
  }

  forecastCache = await fetch5DayForecast();
  lastForecastFetch = now;
  return forecastCache;
}

// ══════════════════════════════════════════════════════════════════════════════
// UI RENDERER
// ══════════════════════════════════════════════════════════════════════════════

function getDynamicIcon(data: WeatherConsensus): string {
  const hour = new Date().toLocaleString("en-US", { timeZone: "Europe/Rome", hour: "numeric", hour12: false });
  const isNight = Number(hour) >= 20 || Number(hour) < 6;

  const isRainy = data.rainProb > 20;
  const isCloudy = data.cloudCover > 50;
  const isWindy = data.windSpeed > 10;

  if (isRainy) return "🌧️";
  if (isWindy) return "🌬️";

  if (isNight) {
    if (isCloudy) return "☁️";
    return "🌙";
  } else {
    if (isCloudy) return "⛅";
    return "☀️";
  }
}

export function renderWeatherToDOM(data: WeatherConsensus, forecast: ForecastDay[]) {
  const mapping: Record<string, string> = {
    'weather-temp': `${data.temperature.toFixed(1)}°C`,
    'weather-wind': `${data.windSpeed.toFixed(1)} m/s`,
    'weather-humidity': `${data.humidity.toFixed(0)}%`,
    'weather-pressure': `${data.pressure.toFixed(0)} hPa`,
    'weather-rain': `${data.rainProb.toFixed(0)}%`,
    'weather-uv': data.uvIndex.toFixed(1),
    'weather-solar': `${(data.cloudCover < 20 ? 'High' : 'Moderate')} W/m²`,
  };

  Object.entries(mapping).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
  });

  const heroTemp = document.getElementById('hero-temp');
  if (heroTemp) heroTemp.innerText = `${data.temperature.toFixed(0)}°C`;

  const heroWind = document.getElementById('hero-wind');
  if (heroWind) heroWind.innerText = `${data.windSpeed.toFixed(1)} m/s`;

  const heroIcon = document.getElementById('hero-weather-icon');
  if (heroIcon) heroIcon.innerText = getDynamicIcon(data);

  // Render farm intelligence
  const farm = analyzeFarmConditions(data);
  const intelligenceEl = document.getElementById('farm-intelligence');
  if (intelligenceEl) {
    intelligenceEl.innerHTML = `
      <div class="farm-intel">
        <div class="intel-item">
          <span class="intel-label">🌱 Spray Window:</span>
          <span class="intel-value ${farm.sprayWindow.recommendation === 'Optimal' ? 'green' : 'yellow'}">
            ${farm.sprayWindow.recommendation}
          </span>
          <span class="intel-reason">${farm.sprayWindow.reason}</span>
        </div>
        <div class="intel-item">
          <span class="intel-label">🦠 Disease Risk:</span>
          <span class="intel-value ${farm.diseaseRisk.level === 'Low' ? 'green' : farm.diseaseRisk.level === 'Medium' ? 'yellow' : 'red'}">
            ${farm.diseaseRisk.level}
          </span>
          <span class="intel-reason">${farm.diseaseRisk.reason}</span>
        </div>
        <div class="intel-item">
          <span class="intel-label">🫒 Harvest:</span>
          <span class="intel-value ${farm.harvestReadiness.status === 'Ready' ? 'green' : 'yellow'}">
            ${farm.harvestReadiness.status}
          </span>
          ${farm.harvestReadiness.daysToHarvest > 0 ? `<span class="intel-reason">${farm.harvestReadiness.daysToHarvest} days to harvest</span>` : ''}
        </div>
      </div>
    `;
  }
}

// Auto-refresh weather UI
(window as any).refreshWeatherUI = async () => {
  try {
    const [current, forecast] = await Promise.all([getWeather(), getForecast()]);
    renderWeatherToDOM(current, forecast);
    console.log("🌦️ UI Updated with live weather + farm intelligence");
  } catch (e) {
    console.error("Weather UI Error:", e);
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// EXPOSE GLOBALLY
// ══════════════════════════════════════════════════════════════════════════════

if (typeof window !== 'undefined') {
  (window as any).WeatherEngine = {
    getWeather,
    getForecast,
    analyzeFarmConditions,
    renderWeatherToDOM,
    refreshWeatherUI: (window as any).refreshWeatherUI,
    unblockSource: (source: string) => Throttler.unblock(source),
  };

  console.log('🌤️ Weather Engine + Farm Intelligence loaded ✅');
}
