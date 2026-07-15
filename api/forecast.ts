// api/forecast.ts — Vercel serverless function

import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { lat, lon } = req.query;

  if (!lat || !lon) {
    return res.status(400).json({ error: 'Missing lat/lon parameters' });
  }

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,weathercode&forecast_days=5&timezone=Europe/Rome`;

    const response = await fetch(url);
    const data = await response.json();

    if (!data.daily) {
      throw new Error('No forecast data returned');
    }

    const forecast = data.daily.time.map((date: string, i: number) => ({
      date: new Date(date),
      tempMin: data.daily.temperature_2m_min[i],
      tempMax: data.daily.temperature_2m_max[i],
      rainProb: (data.daily.precipitation_probability_max[i] || 0) / 100,
      uvIndex: data.daily.uv_index_max[i] || 0,
      condition: getWeatherCondition(data.daily.weathercode[i]),
    }));

    return res.status(200).json(forecast);
  } catch (error) {
    console.error('Forecast API error:', error);
    return res.status(500).json({ error: 'Failed to fetch forecast data' });
  }
}

function getWeatherCondition(code: number): string {
  if (code === 0) return 'Clear';
  if (code <= 3) return 'Partly Cloudy';
  if (code <= 48) return 'Foggy';
  if (code <= 67) return 'Rainy';
  if (code <= 77) return 'Snowy';
  if (code <= 82) return 'Showers';
  return 'Stormy';
}
