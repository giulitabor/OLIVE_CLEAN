// src/services/types.ts — Shared types

import { PublicKey } from "@solana/web3.js";

export interface Portfolio {
  mignoleUnits: number;
  olvTokens: number;
  solBalance: number;
  treeCount: number;
  sharePercentage: number;
}

export interface OilAllocation {
  available: number;
  entitled: number;
  carbonImpactTonnes: number;
  pending: number;
  claimed: number;
}

export interface VillaAvailability {
  availableNights: number;
  days: string[];
  nextAvailable: string | null;
}

export interface ActivityItem {
  id: string;
  wallet: string;
  action: string;
  timestamp: Date;
  metadata: Record<string, any>;
}

export interface DashboardData {
  portfolio: Portfolio;
  oil: OilAllocation;
  weather: WeatherConsensus;
  forecast: ForecastDay[];
  villa: VillaAvailability;
  recentActivity: ActivityItem[];
}

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
