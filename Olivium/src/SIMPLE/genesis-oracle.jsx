import { useState, useEffect, useCallback } from "react";

// ============================================================
// ORACLE DECISION ENGINE
// ============================================================
const OracleEngine = {
  evaluate(weather, sensor) {
    const decisions = [];
    const { rain_prob, evapo, temperature, humidity, soil_moisture_modeled } = weather;
    const soilMoisture = sensor?.soilMoisture ?? soil_moisture_modeled ?? 30;

    // Rule 1: Irrigation
    if (soilMoisture < 25 && evapo > 0.15 && rain_prob < 0.4) {
      decisions.push({
        id: "irrigate",
        type: "action",
        severity: "high",
        title: "Initiate Irrigation",
        detail: `Soil at ${soilMoisture}%, high evapotranspiration, no rain forecast.`,
        icon: "💧",
      });
    } else if (rain_prob > 0.6) {
      decisions.push({
        id: "pause_irr",
        type: "hold",
        severity: "medium",
        title: "Irrigation Paused",
        detail: `Rain likely (${Math.round(rain_prob * 100)}%) — conserving water.`,
        icon: "⏸️",
      });
    } else if (soilMoisture >= 25 && soilMoisture < 40) {
      decisions.push({
        id: "monitor",
        type: "watch",
        severity: "low",
        title: "Monitor Soil Levels",
        detail: `Soil at ${soilMoisture}% — within acceptable range.`,
        icon: "👁️",
      });
    }

    // Rule 2: Heat stress
    if (temperature > 35) {
      decisions.push({
        id: "heat",
        type: "alert",
        severity: "high",
        title: "Heat Stress Risk",
        detail: `Temperature at ${temperature}°C — consider shade/cooling.`,
        icon: "🌡️",
      });
    }

    // Rule 3: Evapotranspiration warning
    if (evapo > 0.18) {
      decisions.push({
        id: "evapo",
        type: "watch",
        severity: "medium",
        title: "High Evapotranspiration",
        detail: `ET rate ${evapo} mm/h — soil drying faster than expected. Check in 6h.`,
        icon: "🔥",
      });
    }

    // Rule 4: Frost risk
    if (temperature < 3) {
      decisions.push({
        id: "frost",
        type: "alert",
        severity: "high",
        title: "Frost Risk",
        detail: `Temperature dropping to ${temperature}°C — protect sensitive crops.`,
        icon: "❄️",
      });
    }

    if (decisions.length === 0) {
      decisions.push({
        id: "nominal",
        type: "nominal",
        severity: "none",
        title: "All Systems Nominal",
        detail: "No interventions required at this time.",
        icon: "✅",
      });
    }

    return decisions;
  },
};

// ============================================================
// TOMORROW.IO API LAYER (with realistic mock fallback)
// ============================================================
async function fetchWeatherData(lat, lon, apiKey) {
  if (!apiKey || apiKey === "demo") return getMockWeatherData();
  try {
    const fields = [
      "temperature", "humidity", "windSpeed", "cloudCover",
      "precipitationProbability", "precipitationIntensity",
      "evapotranspiration", "soilMoistureVolumetric0To10cm",
      "solarRadiationSurface", "uvIndex",
    ].join(",");
    const url = `https://api.tomorrow.io/v4/timelines?location=${lat},${lon}&fields=${fields}&timesteps=1h&units=metric&apikey=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("API error");
    const data = await res.json();
    const values = data.data.timelines[0].intervals[0].values;
    return {
      temperature: values.temperature,
      humidity: values.humidity,
      wind: values.windSpeed,
      cloud_cover: values.cloudCover,
      rain_prob: values.precipitationProbability / 100,
      rain_intensity: values.precipitationIntensity,
      evapo: values.evapotranspiration ?? 0.1,
      soil_moisture_modeled: Math.round((values.soilMoistureVolumetric0To10cm ?? 0.28) * 100),
      solar: values.solarRadiationSurface,
      uv: values.uvIndex,
      source: "live",
    };
  } catch {
    return getMockWeatherData();
  }
}

function getMockWeatherData() {
  const hour = new Date().getHours();
  const dayPhase = hour > 6 && hour < 20;
  return {
    temperature: +(18 + Math.sin(hour / 4) * 6 + (Math.random() - 0.5) * 2).toFixed(1),
    humidity: Math.round(55 + Math.random() * 25),
    wind: +(2 + Math.random() * 8).toFixed(1),
    cloud_cover: Math.round(20 + Math.random() * 50),
    rain_prob: +(0.3 + Math.random() * 0.5).toFixed(2),
    rain_intensity: +(Math.random() * 0.4).toFixed(2),
    evapo: +(dayPhase ? 0.1 + Math.random() * 0.15 : 0.02 + Math.random() * 0.05).toFixed(3),
    soil_moisture_modeled: Math.round(18 + Math.random() * 20),
    solar: dayPhase ? Math.round(200 + Math.random() * 600) : 0,
    uv: dayPhase ? +(1 + Math.random() * 7).toFixed(1) : 0,
    source: "demo",
  };
}

function generateForecast() {
  return Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    temp: +(14 + Math.sin((i - 6) / 4) * 8 + (Math.random() - 0.5) * 2).toFixed(1),
    rain: +(Math.random() * 0.9).toFixed(2),
    evapo: +(i > 6 && i < 20 ? 0.05 + Math.random() * 0.2 : 0.01 + Math.random() * 0.04).toFixed(3),
  }));
}

// ============================================================
// UI COMPONENTS
// ============================================================

const severityColor = {
  high: "#ef4444",
  medium: "#f59e0b",
  low: "#22c55e",
  none: "#22c55e",
};

const typeStyle = {
  action: { bg: "rgba(239,68,68,0.12)", border: "#ef4444" },
  alert: { bg: "rgba(239,68,68,0.12)", border: "#ef4444" },
  hold: { bg: "rgba(245,158,11,0.12)", border: "#f59e0b" },
  watch: { bg: "rgba(59,130,246,0.12)", border: "#3b82f6" },
  nominal: { bg: "rgba(34,197,94,0.12)", border: "#22c55e" },
};

function Gauge({ label, value, unit, min = 0, max = 100, color = "#22c55e" }) {
  const pct = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  const r = 28, circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <svg width="70" height="70" viewBox="0 0 70 70">
        <circle cx="35" cy="35" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="5" />
        <circle
          cx="35" cy="35" r={r} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 35 35)"
          style={{ transition: "stroke-dasharray 1s ease" }}
        />
        <text x="35" y="39" textAnchor="middle" fill="white" fontSize="11" fontFamily="'Space Mono', monospace" fontWeight="bold">
          {value}{unit}
        </text>
      </svg>
      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", fontFamily: "'Space Mono', monospace", letterSpacing: 1, textTransform: "uppercase" }}>{label}</span>
    </div>
  );
}

function MiniBar({ value, max, color }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 3, height: 4, flex: 1, overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.8s ease" }} />
    </div>
  );
}

function ForecastRow({ data }) {
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "flex-end", padding: "0 4px" }}>
      {data.map((d, i) => {
        const isNight = d.hour < 6 || d.hour > 20;
        const h = Math.max(8, Math.round(d.rain * 60));
        return (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <div style={{ width: "100%", background: `rgba(59,130,246,${0.15 + d.rain * 0.7})`, borderRadius: "2px 2px 0 0", height: h, minHeight: 4, transition: "height 0.5s ease" }} />
            {i % 4 === 0 && (
              <span style={{ fontSize: 8, color: "rgba(255,255,255,0.35)", fontFamily: "'Space Mono', monospace" }}>
                {String(d.hour).padStart(2, "0")}h
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TempLine({ data }) {
  const vals = data.map(d => d.temp);
  const min = Math.min(...vals), max = Math.max(...vals);
  const w = 320, h = 60, pad = 8;
  const pts = data.map((d, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2);
    const y = h - pad - ((d.temp - min) / (max - min || 1)) * (h - pad * 2);
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id="tempGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline points={pts} fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

// ============================================================
// MAIN APP
// ============================================================
export default function GenesisOracle() {
  const [weather, setWeather] = useState(null);
  const [forecast, setForecast] = useState([]);
  const [decisions, setDecisions] = useState([]);
  const [sensor, setSensor] = useState({ soilMoisture: 22 });
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [apiKey, setApiKey] = useState("demo");
  const [lat, setLat] = useState("40.7128");
  const [lon, setLon] = useState("-74.0060");
  const [activeTab, setActiveTab] = useState("oracle");
  const [configOpen, setConfigOpen] = useState(false);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(async () => {
    setLoading(true);
    const w = await fetchWeatherData(parseFloat(lat), parseFloat(lon), apiKey);
    setWeather(w);
    setForecast(generateForecast());
    setDecisions(OracleEngine.evaluate(w, sensor));
    setLastUpdate(new Date());
    setLoading(false);
  }, [lat, lon, apiKey, sensor]);

  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    const t = setInterval(() => { setTick(x => x + 1); refresh(); }, 60000);
    return () => clearInterval(t);
  }, [refresh]);

  const now = lastUpdate ? lastUpdate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--:--";

  return (
    <div style={{
      minHeight: "100vh",
      background: "#080c10",
      color: "white",
      fontFamily: "'Space Mono', monospace",
      padding: "24px 20px",
      maxWidth: 480,
      margin: "0 auto",
      position: "relative",
    }}>
      {/* Google Fonts */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;600;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes slideIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:none} }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", letterSpacing: 3, marginBottom: 4 }}>GENESIS v1.8</div>
          <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 26, fontWeight: 800, letterSpacing: -0.5, lineHeight: 1 }}>
            Oracle<br /><span style={{ color: "#22c55e" }}>Admin</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
          <button onClick={() => setConfigOpen(!configOpen)} style={{
            background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8, padding: "6px 12px", color: "white", cursor: "pointer", fontSize: 11,
          }}>⚙ Config</button>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", textAlign: "right" }}>
            {weather?.source === "demo" ? "🟡 DEMO DATA" : "🟢 LIVE"}<br />
            Updated {now}
          </div>
        </div>
      </div>

      {/* Config Panel */}
      {configOpen && (
        <div style={{
          background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 12, padding: 16, marginBottom: 20, animation: "slideIn 0.2s ease",
        }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", letterSpacing: 2, marginBottom: 12 }}>CONFIGURATION</div>
          {[
            { label: "Tomorrow.io API Key", val: apiKey, set: setApiKey, type: "password", ph: "Enter API key (or 'demo')" },
            { label: "Latitude", val: lat, set: setLat, type: "text", ph: "40.7128" },
            { label: "Longitude", val: lon, set: setLon, type: "text", ph: "-74.0060" },
            { label: "Sensor Soil Moisture (%)", val: sensor.soilMoisture, set: v => setSensor({ soilMoisture: +v }), type: "number", ph: "22" },
          ].map(({ label, val, set, type, ph }) => (
            <div key={label} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", letterSpacing: 1, marginBottom: 4 }}>{label.toUpperCase()}</div>
              <input
                type={type} value={val} placeholder={ph}
                onChange={e => set(e.target.value)}
                style={{
                  width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 6, padding: "6px 10px", color: "white", fontSize: 11, fontFamily: "'Space Mono', monospace",
                  outline: "none",
                }}
              />
            </div>
          ))}
          <button onClick={() => { refresh(); setConfigOpen(false); }} style={{
            width: "100%", background: "#22c55e", border: "none", borderRadius: 8,
            padding: "9px", color: "#080c10", fontFamily: "'Space Mono', monospace",
            fontWeight: "bold", fontSize: 11, cursor: "pointer", letterSpacing: 1,
          }}>APPLY & REFRESH</button>
        </div>
      )}

      {/* Tab Nav */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
        {[["oracle", "🧠 Oracle"], ["weather", "🌦 Weather"], ["api", "🔗 API"]].map(([id, label]) => (
          <button key={id} onClick={() => setActiveTab(id)} style={{
            flex: 1, padding: "8px 4px", borderRadius: 8, border: "1px solid",
            borderColor: activeTab === id ? "#22c55e" : "rgba(255,255,255,0.1)",
            background: activeTab === id ? "rgba(34,197,94,0.1)" : "rgba(255,255,255,0.03)",
            color: activeTab === id ? "#22c55e" : "rgba(255,255,255,0.5)",
            cursor: "pointer", fontSize: 10, fontFamily: "'Space Mono', monospace", letterSpacing: 0.5,
          }}>{label}</button>
        ))}
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.3)" }}>
          <div style={{ fontSize: 24, animation: "spin 1s linear infinite", display: "inline-block" }}>⟳</div>
          <div style={{ fontSize: 10, marginTop: 8, letterSpacing: 2 }}>FETCHING DATA...</div>
        </div>
      )}

      {/* ORACLE TAB */}
      {!loading && activeTab === "oracle" && weather && (
        <div style={{ animation: "slideIn 0.3s ease" }}>
          {/* Sensor vs Model */}
          <div style={{
            background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 12, padding: 16, marginBottom: 16,
          }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", letterSpacing: 2, marginBottom: 12 }}>SOIL VALIDATION LAYER</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {[
                { label: "SENSOR (truth)", value: sensor.soilMoisture + "%", color: "#22c55e", sub: "Real-time field data" },
                { label: "MODEL (predict)", value: weather.soil_moisture_modeled + "%", color: "#3b82f6", sub: "Tomorrow.io" },
              ].map(({ label, value, color, sub }) => (
                <div key={label} style={{ background: `rgba(${color === "#22c55e" ? "34,197,94" : "59,130,246"},0.07)`, borderRadius: 8, padding: 12, border: `1px solid ${color}22` }}>
                  <div style={{ fontSize: 8, color: "rgba(255,255,255,0.4)", letterSpacing: 1, marginBottom: 4 }}>{label}</div>
                  <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 24, fontWeight: 800, color }}>{value}</div>
                  <div style={{ fontSize: 8, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>{sub}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12, padding: "8px 10px", background: "rgba(255,255,255,0.04)", borderRadius: 6, fontSize: 9, color: "rgba(255,255,255,0.4)", letterSpacing: 0.5 }}>
              Δ DRIFT: {Math.abs(sensor.soilMoisture - weather.soil_moisture_modeled)}% — {Math.abs(sensor.soilMoisture - weather.soil_moisture_modeled) < 5 ? "✅ Within tolerance" : "⚠️ Sensor/model divergence detected"}
            </div>
          </div>

          {/* Decisions */}
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", letterSpacing: 2, marginBottom: 10 }}>ORACLE DECISIONS ({decisions.length})</div>
          {decisions.map((d, i) => {
            const s = typeStyle[d.type] || typeStyle.nominal;
            return (
              <div key={d.id} style={{
                background: s.bg, border: `1px solid ${s.border}44`,
                borderLeft: `3px solid ${s.border}`,
                borderRadius: 10, padding: "12px 14px", marginBottom: 10,
                animation: `slideIn 0.3s ease ${i * 0.08}s both`,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 16 }}>{d.icon}</span>
                    <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 600, fontSize: 13 }}>{d.title}</span>
                  </div>
                  <span style={{ fontSize: 8, color: s.border, letterSpacing: 1, textTransform: "uppercase", border: `1px solid ${s.border}44`, padding: "2px 6px", borderRadius: 4 }}>
                    {d.type}
                  </span>
                </div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", lineHeight: 1.5 }}>{d.detail}</div>
              </div>
            );
          })}

          {/* Logic trace */}
          <div style={{
            background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 10, padding: 14, marginTop: 4,
          }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", letterSpacing: 2, marginBottom: 10 }}>RULE ENGINE TRACE</div>
            {[
              { label: "soil_moisture < 25%", val: sensor.soilMoisture < 25, check: sensor.soilMoisture },
              { label: "evapotranspiration HIGH (>0.15)", val: weather.evapo > 0.15, check: weather.evapo },
              { label: "rain_probability > 60%", val: weather.rain_prob > 0.6, check: `${Math.round(weather.rain_prob * 100)}%` },
              { label: "temperature > 35°C", val: weather.temperature > 35, check: weather.temperature },
            ].map(({ label, val, check }) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <span style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", fontFamily: "'Space Mono', monospace" }}>{label}</span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)" }}>{check}</span>
                  <span style={{ color: val ? "#ef4444" : "#22c55e", fontSize: 10 }}>{val ? "TRUE" : "FALSE"}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* WEATHER TAB */}
      {!loading && activeTab === "weather" && weather && (
        <div style={{ animation: "slideIn 0.3s ease" }}>
          {/* Gauges */}
          <div style={{
            background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 12, padding: 16, marginBottom: 16,
          }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", letterSpacing: 2, marginBottom: 14 }}>ATMOSPHERIC LAYER</div>
            <div style={{ display: "flex", justifyContent: "space-around" }}>
              <Gauge label="Temp" value={weather.temperature} unit="°" min={-10} max={45} color="#f59e0b" />
              <Gauge label="Humidity" value={weather.humidity} unit="%" color="#3b82f6" />
              <Gauge label="Wind" value={weather.wind} unit="m/s" min={0} max={30} color="#a78bfa" />
              <Gauge label="Cloud" value={weather.cloud_cover} unit="%" color="#94a3b8" />
            </div>
          </div>

          {/* Rain */}
          <div style={{
            background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 12, padding: 16, marginBottom: 16,
          }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", letterSpacing: 2, marginBottom: 14 }}>PRECIPITATION LAYER</div>
            {[
              { label: "Rain probability", value: `${Math.round(weather.rain_prob * 100)}%`, bar: weather.rain_prob, color: "#3b82f6" },
              { label: "Rain intensity (mm/h)", value: weather.rain_intensity, bar: weather.rain_intensity / 5, color: "#60a5fa" },
            ].map(({ label, value, bar, color }) => (
              <div key={label} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{label}</span>
                  <span style={{ fontSize: 10, color, fontWeight: "bold" }}>{value}</span>
                </div>
                <MiniBar value={bar} max={1} color={color} />
              </div>
            ))}
          </div>

          {/* Soil/Evapo */}
          <div style={{
            background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 12, padding: 16, marginBottom: 16,
          }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", letterSpacing: 2, marginBottom: 14 }}>SOIL & WATER LAYER</div>
            {[
              { label: "Soil moisture (modeled)", value: weather.soil_moisture_modeled + "%", bar: weather.soil_moisture_modeled / 100, color: "#22c55e" },
              { label: "Evapotranspiration (mm/h)", value: weather.evapo, bar: weather.evapo / 0.5, color: "#f97316" },
              { label: "Solar radiation (W/m²)", value: weather.solar, bar: weather.solar / 1000, color: "#fbbf24" },
              { label: "UV Index", value: weather.uv, bar: weather.uv / 11, color: "#c084fc" },
            ].map(({ label, value, bar, color }) => (
              <div key={label} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{label}</span>
                  <span style={{ fontSize: 10, color, fontWeight: "bold" }}>{value}</span>
                </div>
                <MiniBar value={bar} max={1} color={color} />
              </div>
            ))}
          </div>

          {/* Forecast Charts */}
          <div style={{
            background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 12, padding: 16,
          }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", letterSpacing: 2, marginBottom: 10 }}>24H FORECAST</div>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginBottom: 6 }}>Temperature curve</div>
            <TempLine data={forecast} />
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginBottom: 6, marginTop: 14 }}>Precipitation probability</div>
            <ForecastRow data={forecast} />
          </div>
        </div>
      )}

      {/* API TAB */}
      {!loading && activeTab === "api" && weather && (
        <div style={{ animation: "slideIn 0.3s ease" }}>
          <div style={{
            background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 12, padding: 16, marginBottom: 16,
          }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", letterSpacing: 2, marginBottom: 12 }}>TOMORROW.IO REQUEST</div>
            <pre style={{
              fontSize: 9, color: "#22c55e", background: "rgba(34,197,94,0.05)",
              border: "1px solid rgba(34,197,94,0.15)", borderRadius: 8,
              padding: 12, overflowX: "auto", lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-all",
            }}>{`GET https://api.tomorrow.io/v4/timelines
  ?location=${lat},${lon}
  &fields=temperature
  &fields=humidity
  &fields=precipitationProbability
  &fields=soilMoistureVolumetric0To10cm
  &fields=evapotranspiration
  &fields=windSpeed
  &fields=cloudCover
  &fields=solarRadiationSurface
  &timesteps=1h
  &units=metric
  &apikey=YOUR_KEY`}</pre>
          </div>

          <div style={{
            background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 12, padding: 16, marginBottom: 16,
          }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", letterSpacing: 2, marginBottom: 12 }}>NORMALIZED DATA MODEL</div>
            <pre style={{
              fontSize: 9, color: "#3b82f6", background: "rgba(59,130,246,0.05)",
              border: "1px solid rgba(59,130,246,0.15)", borderRadius: 8,
              padding: 12, overflowX: "auto", lineHeight: 1.7, whiteSpace: "pre-wrap",
            }}>{JSON.stringify({
  timestamp: new Date().toISOString(),
  location: { lat: parseFloat(lat), lon: parseFloat(lon) },
  weather: {
    temperature: weather.temperature,
    humidity: weather.humidity,
    wind: weather.wind,
    cloud_cover: weather.cloud_cover,
    rain_prob: weather.rain_prob,
    rain_intensity: weather.rain_intensity,
    evapo: weather.evapo,
    soil_moisture_modeled: weather.soil_moisture_modeled,
    solar: weather.solar,
    uv: weather.uv,
  },
  sensor: { soil_moisture: sensor.soilMoisture },
}, null, 2)}</pre>
          </div>

          <div style={{
            background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 12, padding: 16,
          }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", letterSpacing: 2, marginBottom: 12 }}>ORACLE RULE SCHEMA (JSON)</div>
            <pre style={{
              fontSize: 9, color: "#f59e0b", background: "rgba(245,158,11,0.05)",
              border: "1px solid rgba(245,158,11,0.15)", borderRadius: 8,
              padding: 12, overflowX: "auto", lineHeight: 1.7, whiteSpace: "pre-wrap",
            }}>{JSON.stringify({
  rules: [
    {
      id: "irrigate",
      conditions: [
        { field: "sensor.soilMoisture", op: "<", value: 25 },
        { field: "weather.evapo", op: ">", value: 0.15 },
        { field: "weather.rain_prob", op: "<", value: 0.4 },
      ],
      operator: "AND",
      action: { type: "irrigate", priority: "high" },
    },
    {
      id: "pause_irrigation",
      conditions: [{ field: "weather.rain_prob", op: ">", value: 0.6 }],
      operator: "AND",
      action: { type: "hold", priority: "medium" },
    },
    {
      id: "heat_alert",
      conditions: [{ field: "weather.temperature", op: ">", value: 35 }],
      operator: "AND",
      action: { type: "alert", priority: "high" },
    },
  ],
}, null, 2)}</pre>
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{ textAlign: "center", marginTop: 24, fontSize: 8, color: "rgba(255,255,255,0.15)", letterSpacing: 2 }}>
        GENESIS v1.8 · ORACLE ENGINE · {weather?.source === "demo" ? "DEMO MODE" : "LIVE MODE"}
      </div>
    </div>
  );
}
