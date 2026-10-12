// ─── Core Types ───────────────────────────────────────────────────────────────

export type SatelliteSource = 'MODIS' | 'VIIRS';

export type FireIntensityLevel =
  | 'low'
  | 'moderate'
  | 'high'
  | 'very-high'
  | 'extreme';

// A single raw fire hotspot as received from NASA FIRMS
export interface FireHotspot {
  id: string;
  source: SatelliteSource;
  date: string; // ISO yyyy-mm-dd
  lat: number;
  lng: number;
  brightness: number; // Kelvin — MODIS uses 310-500K, VIIRS 300-450K
  confidence: number; // 0-100
  frp: number; // Fire Radiative Power (MW)
  scan: number; // pixel size
  track: number; // pixel size
  acqTime: string; // HH:mm UTC
}

// Harmonized hotspot after deduplication
export interface HarmonizedHotspot {
  // Unique identifier for the harmonized cluster
  id: string;
  // Centroid coordinates (averaged from merged detections)
  lat: number;
  lng: number;
  // Combined FRP (sum of constituent points)
  frp: number;
  // Normalized confidence (weighted average 0-100)
  confidence: number;
  // Average brightness temperature (K)
  brightness: number;
  // Sources that contributed to this cluster (for tooltip info)
  sources: SatelliteSource[];
  // Original detection dates (all same day by design)
  date: string;
}

// Harmonized daily aggregate for a region
export interface DailyFireSummary {
  date: string; // yyyy-mm-dd
  dayOfYear: number;
  month: number; // 1-12
  day: number; // 1-31
  year: number;

  // Raw counts per satellite
  modisCount: number;
  viirsCount: number;

  // Harmonized metrics
  harmonizedCount: number; // deduplicated / scaled composite
  totalFRP: number; // total fire radiative power (MW)
  meanBrightness: number; // mean brightness temp (K)
  meanConfidence: number;

  // Intensity classification
  intensity: FireIntensityLevel;
  intensityScore: number; // 0-100

  // High-confidence hotspot ratio
  highConfidenceRatio: number;
}

// Monthly aggregation
export interface MonthlyFireSummary {
  year: number;
  month: number;
  harmonizedCount: number;
  totalFRP: number;
  modisCount: number;
  viirsCount: number;
  anomalyScore: number;
  intensity: FireIntensityLevel;
}

// Yearly aggregation
export interface YearlyFireSummary {
  year: number;
  harmonizedCount: number;
  totalFRP: number;
  modisCount: number;
  viirsCount: number;
  peakDay: string | null;
  anomalyScore: number;
}

// ─── Regions ──────────────────────────────────────────────────────────────────

export interface Region {
  id: string;
  name: string;
  country: string;
  scope: 'world' | 'continent' | 'country';
  bbox: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  };
  // Center point for map view (latitude, longitude)
  center: [number, number];
  // Recommended Leaflet zoom level for this region
  zoom: number;
  // Bounds array for Leaflet rectangle overlay [[minLat, minLng], [maxLat, maxLng]]
  bounds: [[number, number], [number, number]];
  fireSeason: {
    startMonth: number;
    endMonth: number;
  };
  description: string;
}

// ─── Anomaly Detection ────────────────────────────────────────────────────────

export type AnomalySeverity = 'none' | 'watch' | 'warning' | 'critical';

export interface AnomalyResult {
  date: string;
  severity: AnomalySeverity;
  deviationPercent: number; // % above historical baseline
  harmonizedCount: number;
  baseline: number;
  zScore: number;
}

export interface CriticalPeriod {
  startDate: string;
  endDate: string;
  severity: AnomalySeverity;
  peakDate: string;
  totalHotspots: number;
  meanDailyFRP: number;
  durationDays: number;
  description: string;
}

// ─── Early Warning ────────────────────────────────────────────────────────────

export type WarningLevel = 'normal' | 'advisory' | 'watch' | 'warning' | 'extreme';

export interface EarlyWarning {
  level: WarningLevel;
  title: string;
  message: string;
  region: string;
  date: string;
  metrics: {
    recentAvg: number;
    historicalAvg: number;
    deviation: number;
    trend: 'rising' | 'declining' | 'stable';
  };
  recommendations: string[];
}

// ─── Calendar Grid ────────────────────────────────────────────────────────────

export interface CalendarWeek {
  days: (CalendarDay | null)[];
}

export interface CalendarDay {
  summary: DailyFireSummary;
  anomaly: AnomalyResult | null;
  isToday: boolean;
}

// ─── UI State ─────────────────────────────────────────────────────────────────

export interface StatsOverview {
  totalHotspots: number;
  totalFRP: number;
  meanDailyHotspots: number;
  peakDayCount: number;
  peakDayDate: string | null;
  anomalyCount: number;
  harmonizationDelta: number; // difference between raw sum and harmonized
}

export interface TrendPoint {
  date: string;
  harmonizedCount: number;
  modisCount: number;
  viirsCount: number;
  totalFRP: number;
  rolling7: number;
}
