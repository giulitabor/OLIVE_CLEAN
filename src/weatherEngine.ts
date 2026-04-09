/**
 * weatherEngine.ts
 *
 * Multi-source weather consensus engine with smart throttling
 * Uses Tomorrow.io (when available) + Open-Meteo (free, reliable)
 */

// ══════════════════════════════════════════════════════════════════════════════
// THROTTLER - Prevents API abuse and handles rate limits
// ══════════════════════════════════════════════════════════════════════════════

class WeatherThrottler {
  private blockedSources: Set<string> = new Set();
  private lastFetch: Map<string, number> = new Map();
  private minInterval = 60000; // 1 minute between calls per source

  isBlocked(source: string, maxAttempts: number = 3): boolean {
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
// WEATHER CONSENSUS ENGINE
// ══════════════════════════════════════════════════════════════════════════════

interface WeatherResult {
  name: string;
  temp: number;
  humidity?: number;
  windSpeed?: number;
  pressure?: number;
  rainProb: number;
  uvIndex?: number;
  cloudCover?: number;
}

interface WeatherConsensus {
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

/**
 * Fetch weather from multiple sources and return consensus
 */
 // ══════════════════════════════════════════════════════════════════════════════
 // DEBUG VERSION: weatherEngine.ts
 // ══════════════════════════════════════════════════════════════════════════════

 export async function fetchWeatherConsensus(lat: number = 43.0833, lon: number = 10.5333): Promise<WeatherConsensus> {
   const results: WeatherResult[] = [];

   // 1. TOMORROW.IO
   try {
     const apiKey = 'K6ik2jrBrMwH3yBDtxf3gQC7hgrxxCkf';
     const res = await fetch(`https://api.tomorrow.io/v4/weather/realtime?location=${lat},${lon}&apikey=${apiKey}`);
     const data = await res.json();
     console.log("[DEBUG] Tomorrow.io Raw:", data);

     if (data.data && data.data.values) {
       const v = data.data.values;
       results.push({
         name: 'Tomorrow.io',
         temp: v.temperature,
         humidity: v.humidity,
         windSpeed: v.windSpeed,
         pressure: v.pressureSurfaceLevel,
         rainProb: v.precipitationProbability || 0, // Tomorrow.io returns 0-100
         uvIndex: v.uvIndex,
         cloudCover: v.cloudCover
       });
     }
   } catch (e) { console.error("Tomorrow.io Fail:", e); }

   // 2. OPEN-METEO
   try {
     const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,surface_pressure,uv_index&hourly=precipitation_probability&forecast_days=1`);
     const data = await res.json();
     console.log("[DEBUG] Open-Meteo Raw:", data);

     if (data.current) {
       results.push({
         name: 'Open-Meteo',
         temp: data.current.temperature_2m,
         humidity: data.current.relative_humidity_2m,
         windSpeed: data.current.wind_speed_10m,
         pressure: data.current.surface_pressure,
         rainProb: data.hourly.precipitation_probability[0] || 0, // Open-Meteo returns 0-100
         uvIndex: data.current.uv_index,
         cloudCover: data.current.cloud_cover
       });
     }
   } catch (e) { console.error("Open-Meteo Fail:", e); }

   // CALCULATE CONSENSUS
   const consensus: WeatherConsensus = {
     temperature: average(results.map(r => r.temp)),
     humidity: average(results.map(r => r.humidity || 0)),
     windSpeed: average(results.map(r => r.windSpeed || 0)),
     pressure: average(results.map(r => r.pressure || 1013)),
     rainProb: average(results.map(r => r.rainProb)),
     uvIndex: average(results.map(r => r.uvIndex || 0)),
     cloudCover: average(results.map(r => r.cloudCover || 0)),
     sources: results.map(r => r.name),
     confidence: results.length / 2,
     timestamp: new Date()
   };

   return consensus;
 }

 function getDynamicIcon(data: any): string {
  // 1. Determine if it's Day or Night in Italy (approx 6am - 8pm)
  const hour = new Date().toLocaleString("en-US", {timeZone: "Europe/Rome", hour: "numeric", hour12: false});
  const isNight = Number(hour) >= 20 || Number(hour) < 6;

  // 2. Map conditions
  const isRainy = data.rainProb > 20;
  const isCloudy = data.cloudCover > 50;
  const isWindy = data.windSpeed > 10;

  if (isRainy) return "🌧️";
  if (isWindy) return "🌬️";

  if (isNight) {
    if (isCloudy) return "☁️"; // Cloudy night
    return "🌙"; // Clear night
  } else {
    if (isCloudy) return "⛅"; // Partly cloudy day
    return "☀️"; // Clear day
  }
}
/**
 * Helper: Calculate average
 */
function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, val) => sum + val, 0) / values.length;
}

// ══════════════════════════════════════════════════════════════════════════════
// FORECAST (5-DAY)
// ══════════════════════════════════════════════════════════════════════════════

interface ForecastDay {
  date: Date;
  tempMin: number;
  tempMax: number;
  rainProb: number;
  uvIndex: number;
  condition: string;
}

/**
 * Fetch 5-day forecast from Open-Meteo (free, reliable)
 */
export async function fetch5DayForecast(
  lat: number = 43.0833,
  lon: number = 10.5333
): Promise<ForecastDay[]> {

  try {
    const url = `https://api.open-meteo.com/v1/forecast?` +
      `latitude=${lat}&longitude=${lon}` +
      `&daily=temperature_2m_max,temperature_2m_min,` +
      `precipitation_probability_max,uv_index_max,weathercode` +
      `&forecast_days=5&timezone=Europe/Rome`;

    const res = await fetch(url);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();
    const daily = data.daily;

    const forecast: ForecastDay[] = [];

    for (let i = 0; i < 5; i++) {
      forecast.push({
        date: new Date(daily.time[i]),
        tempMin: daily.temperature_2m_min[i],
        tempMax: daily.temperature_2m_max[i],
        rainProb: (daily.precipitation_probability_max[i] || 0) / 100,
        uvIndex: daily.uv_index_max[i] || 0,
        condition: getWeatherCondition(daily.weathercode[i])
      });
    }

    console.log('[FORECAST] ✅ 5-day forecast fetched');
    return forecast;

  } catch (err) {
    console.warn('[FORECAST] Error:', err);
    return generateFallbackForecast();
  }
}

/**
 * Convert WMO weather code to readable condition
 */
function getWeatherCondition(code: number): string {
  if (code === 0) return 'Clear';
  if (code <= 3) return 'Partly Cloudy';
  if (code <= 48) return 'Foggy';
  if (code <= 67) return 'Rainy';
  if (code <= 77) return 'Snowy';
  if (code <= 82) return 'Showers';
  return 'Stormy';
}

/**
 * Generate fallback forecast
 */
function generateFallbackForecast(): ForecastDay[] {
  const forecast: ForecastDay[] = [];
  const today = new Date();

  for (let i = 0; i < 5; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);

    forecast.push({
      date,
      tempMin: 18 + Math.random() * 3,
      tempMax: 24 + Math.random() * 4,
      rainProb: Math.random() * 0.3,
      uvIndex: 5 + Math.random() * 3,
      condition: 'Partly Cloudy'
    });
  }

  return forecast;
}

// ══════════════════════════════════════════════════════════════════════════════
// CACHING
// ══════════════════════════════════════════════════════════════════════════════

let weatherCache: WeatherConsensus | null = null;
let forecastCache: ForecastDay[] | null = null;
let lastWeatherFetch = 0;
let lastForecastFetch = 0;

const CACHE_DURATION_MS = 300000; // 5 minutes

/**
 * Get weather with caching
 */
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

/**
 * Get forecast with caching
 */
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
// EXPOSE GLOBALLY
// ══════════════════════════════════════════════════════════════════════════════

if (typeof window !== 'undefined') {
  (window as any).WeatherEngine = {
    getWeather,
    getForecast,
    fetchWeatherConsensus,
    fetch5DayForecast,
    unblockSource: (source: string) => Throttler.unblock(source)
  };

  console.log('[WEATHER] Weather Engine loaded ✅');
}

export { WeatherThrottler, Throttler };



export function renderWeatherToDOM(data: WeatherConsensus, forecast: any[]) {
  console.log("[DEBUG] Rendering to DOM with:", data);

  // CRITICAL FIX: The mapping must match the property names in WeatherConsensus above
  const mapping: Record<string, string> = {
    'weather-temp': `${data.temperature.toFixed(1)}°C`,
    'weather-wind': `${data.windSpeed.toFixed(1)} m/s`,
    'weather-humidity': `${data.humidity.toFixed(0)}%`,
    'weather-pressure': `${data.pressure.toFixed(0)} hPa`,
    'weather-rain': `${data.rainProb.toFixed(0)}%`,
    'weather-uv': data.uvIndex.toFixed(1),
    'weather-solar': `${(data.cloudCover < 20 ? 'High' : 'Moderate')} W/m²` // Derived solar
  };
  // NEW: Update Hero2 specifically
    const heroTemp = document.getElementById('hero-temp');
    if (heroTemp) heroTemp.innerText = `${data.temperature.toFixed(0)}°C`;

    const heroWind = document.getElementById('hero-wind');
    if (heroWind) heroWind.innerText = `${data.windSpeed.toFixed(1)} m/s`;

    const heroIcon = document.getElementById('hero-weather-icon');
    if (heroIcon) heroIcon.innerText = getDynamicIcon(data);
  Object.entries(mapping).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) {
      el.innerText = val;
      console.log(`[DEBUG] Set ${id} to ${val}`);
    } else {
      console.warn(`[DEBUG] Element ID not found: ${id}`);
    }
  });
}

// Auto-run when data is fetched
(window as any).refreshWeatherUI = async () => {
  try {
    const [current, forecast] = await Promise.all([getWeather(), getForecast()]);
    renderWeatherToDOM(current, forecast);
    console.log("🌦️ UI Updated with live weather");
  } catch (e) {
    console.error("Weather UI Error:", e);
  }
};
