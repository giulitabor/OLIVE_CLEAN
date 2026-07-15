// src/components/Dashboard.tsx

import React, { useState, useEffect } from 'react';
import { loadDashboard, DashboardData } from '../services/dashboard-data';
import { connectWallet, disconnectWallet, getActiveWallet } from '../services/connection';
import { renderWeatherToDOM } from '../services/weatherEngine';

export function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [wallet, setWallet] = useState<string | null>(getActiveWallet());
  const [error, setError] = useState<string | null>(null);

  // Load dashboard data
  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const dashboardData = await loadDashboard();
      setData(dashboardData);
      
      // Render weather to DOM (if using vanilla elements)
      if (dashboardData.weather) {
        renderWeatherToDOM(dashboardData.weather, dashboardData.forecast);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  // Handle wallet connection
  const handleConnect = async () => {
    try {
      const walletAddress = await connectWallet();
      setWallet(walletAddress);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect wallet');
    }
  };

  const handleDisconnect = async () => {
    await disconnectWallet();
    setWallet(null);
    await loadData();
  };

  // Load data on mount
  useEffect(() => {
    loadData();
  }, []);

  // Listen for wallet changes
  useEffect(() => {
    const handler = () => {
      setWallet(getActiveWallet());
      loadData();
    };
    window.addEventListener('walletChanged', handler);
    return () => window.removeEventListener('walletChanged', handler);
  }, []);

  if (loading && !data) {
    return <div className="loading">Loading Olivium Ecosystem...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  if (!data) {
    return <div className="empty">No data available</div>;
  }

  return (
    <div className="dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <h1>🌿 Olivium Ecosystem</h1>
        <div className="wallet-section">
          {wallet ? (
            <>
              <span className="wallet-address">
                {wallet.slice(0, 4)}...{wallet.slice(-4)}
              </span>
              <button onClick={handleDisconnect}>Disconnect</button>
            </>
          ) : (
            <button onClick={handleConnect}>Connect Wallet</button>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">🌳 Mignole Units</div>
          <div className="stat-value">{data.portfolio.mignoleUnits.toLocaleString()}</div>
          <div className="stat-sub">{data.portfolio.treeCount} trees</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">🫒 Olive Oil</div>
          <div className="stat-value">{data.oil.available.toFixed(1)} L</div>
          <div className="stat-sub">Available of {data.oil.entitled.toFixed(1)} L</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">🏡 Villa Nights</div>
          <div className="stat-value">{data.villa.availableNights}</div>
          <div className="stat-sub">Next available: {data.villa.nextAvailable || '—'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">🌤️ Weather</div>
          <div className="stat-value">{data.weather.temperature.toFixed(0)}°C</div>
          <div className="stat-sub">{data.weather.humidity.toFixed(0)}% humidity</div>
        </div>
      </div>

      {/* Weather Detail */}
      <div className="weather-detail">
        <div className="weather-main">
          <span className="weather-icon">{getWeatherIcon(data.weather)}</span>
          <div className="weather-temp">{data.weather.temperature.toFixed(0)}°C</div>
          <div className="weather-details">
            <span>💨 {data.weather.windSpeed.toFixed(1)} m/s</span>
            <span>💧 {data.weather.humidity.toFixed(0)}%</span>
            <span>☔ {data.weather.rainProb.toFixed(0)}%</span>
          </div>
        </div>
        <div className="weather-forecast">
          {data.forecast.map((day, i) => (
            <div className="forecast-day" key={i}>
              <div className="day-name">
                {i === 0 ? 'Today' : day.date.toLocaleDateString('en', { weekday: 'short' })}
              </div>
              <div className="day-icon">{getConditionIcon(day.condition)}</div>
              <div className="day-temp">
                <span className="high">{day.tempMax.toFixed(0)}°</span>
                <span className="low">{day.tempMin.toFixed(0)}°</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Farm Intelligence */}
      <div className="farm-intelligence" id="farm-intelligence">
        {/* Rendered by renderWeatherToDOM */}
      </div>

      {/* Activity Feed */}
      <div className="activity-feed">
        <h3>📢 Recent Activity</h3>
        <div className="activity-list">
          {data.recentActivity.length === 0 ? (
            <p className="no-activity">No recent activity — connect wallet to see your activity</p>
          ) : (
            data.recentActivity.map((item) => (
              <div className="activity-item" key={item.id}>
                <span className="activity-icon">{getActivityIcon(item.action)}</span>
                <span className="activity-text">{item.action.replace('_', ' ')}</span>
                <span className="activity-time">
                  {item.timestamp.toLocaleDateString()}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Oil Actions */}
      <div className="actions">
        <button className="action-btn" onClick={() => alert('Claim oil flow')}>
          🛢️ Claim Oil
        </button>
        <button className="action-btn" onClick={() => alert('Sell to DAO flow')}>
          💰 Sell to DAO
        </button>
        <button className="action-btn" onClick={() => alert('Book villa flow')}>
          🏡 Book Villa
        </button>
      </div>
    </div>
  );
}

// ─── Helper Functions ──────────────────────────────────────────────

function getWeatherIcon(weather: any): string {
  if (weather.rainProb > 20) return '🌧️';
  if (weather.cloudCover > 70) return '☁️';
  if (weather.cloudCover > 30) return '⛅';
  return '☀️';
}

function getConditionIcon(condition: string): string {
  const map: Record<string, string> = {
    'Clear': '☀️',
    'Partly Cloudy': '⛅',
    'Foggy': '🌫️',
    'Rainy': '🌧️',
    'Snowy': '❄️',
    'Showers': '☔',
    'Stormy': '⛈️',
  };
  return map[condition] || '🌤️';
}

function getActivityIcon(action: string): string {
  const map: Record<string, string> = {
    'villa_booked': '🏡',
    'oil_claimed': '🫒',
    'oil_sold_to_dao': '💰',
    'tree_purchased': '🌳',
    'connected': '🔗',
  };
  return map[action] || '📌';
}
