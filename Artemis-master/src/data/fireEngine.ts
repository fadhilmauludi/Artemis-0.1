import type {
  FireHotspot,
  SatelliteSource,
  DailyFireSummary,
  MonthlyFireSummary,
  YearlyFireSummary,
  FireIntensityLevel,
  Region,
  StatsOverview,
  TrendPoint,
} from '@/types';
import { REGIONS } from '@/data/regions';

// ─── Seeded PRNG (Mulberry32) ────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ─── Date Helpers ────────────────────────────────────────────────────────────

function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const diff = date.getTime() - start;
  return Math.floor(diff / 86400000);
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function dateRange(start: Date, end: Date): Date[] {
  const dates: Date[] = [];
  let d = new Date(start);
  while (d <= end) {
    dates.push(new Date(d));
    d = addDays(d, 1);
  }
  return dates;
}

/** Today's date string in YYYY-MM-DD UTC */
export function getTodayISO(): string {
  return isoDate(new Date());
}

// ─── Intensity Classification ────────────────────────────────────────────────

function classifyIntensity(
  count: number,
  totalFRP: number,
  meanBrightness: number,
): { intensity: FireIntensityLevel; score: number } {
  const frpNorm = Math.min(totalFRP / 5000, 1);
  const countNorm = Math.min(count / 200, 1);
  const brightNorm = Math.min((meanBrightness - 300) / 200, 1);
  const score = Math.round((frpNorm * 0.5 + countNorm * 0.35 + brightNorm * 0.15) * 100);

  if (score >= 80) return { intensity: 'extreme', score };
  if (score >= 60) return { intensity: 'very-high', score };
  if (score >= 40) return { intensity: 'high', score };
  if (score >= 20) return { intensity: 'moderate', score };
  return { intensity: 'low', score };
}

// ─── Seasonal Fire Model ─────────────────────────────────────────────────────

function seasonalFireMagnitude(
  dayNum: number,
  region: Region,
  rng: () => number,
): number {
  const { startMonth, endMonth } = region.fireSeason;
  const date = new Date(Date.UTC(2024, 0, dayNum));
  const month = date.getUTCMonth() + 1;

  let seasonal: number;

  if (startMonth <= endMonth) {
    const midMonth = (startMonth + endMonth) / 2;
    const dist = Math.abs(month - midMonth);
    const halfWidth = (endMonth - startMonth) / 2 + 1;
    seasonal = Math.max(0, 1 - (dist / halfWidth) ** 2);
  } else {
    const monthsFromStart = ((month - startMonth + 12) % 12);
    const seasonLength = ((endMonth - startMonth + 12) % 12) + 1;
    const midPoint = seasonLength / 2;
    const dist = Math.abs(monthsFromStart - midPoint);
    seasonal = Math.max(0, 1 - (dist / midPoint) ** 2);
  }

  const weeklyNoise = 0.7 + 0.6 * rng();
  const spike = rng() < 0.04 ? 1.5 + rng() * 1.5 : 1;
  const year = date.getUTCFullYear();
  const ensoFactor = getEnsoFactor(year, rng);

  return seasonal * weeklyNoise * spike * ensoFactor;
}

function getEnsoFactor(year: number, rng: () => number): number {
  const elNinoYears = [2015, 2019, 2023, 2024, 2026];
  const laNinaYears = [2010, 2011, 2020, 2021, 2022, 2025];
  if (elNinoYears.includes(year)) return 1.3 + rng() * 0.2;
  if (laNinaYears.includes(year)) return 0.7 + rng() * 0.1;
  return 0.9 + rng() * 0.2;
}

// ─── Hotspot Generation ──────────────────────────────────────────────────────

function generateDailyHotspots(
  date: Date,
  region: Region,
  magnitude: number,
  rng: () => number,
): { modis: FireHotspot[]; viirs: FireHotspot[] } {
  // Global uses a smaller multiplier to keep things fast
  const globalScale = region.id === 'global' ? 2 : 1;
  const modisBase = Math.round(magnitude * 30 * globalScale);
  const viirsBase = Math.round(magnitude * 90 * globalScale);

  const modisCount = Math.max(0, modisBase + Math.round((rng() - 0.5) * modisBase * 0.3));
  const viirsCount = Math.max(0, viirsBase + Math.round((rng() - 0.5) * viirsBase * 0.3));

  const realRegions = REGIONS.filter(r => r.scope === 'country');

  const generateHotspots = (
    count: number,
    source: SatelliteSource,
  ): FireHotspot[] => {
    const hotspots: FireHotspot[] = [];
    for (let i = 0; i < count; i++) {
      let r = region;
      if (region.id === 'global') {
        r = realRegions[Math.floor(rng() * realRegions.length)];
      }

      const { minLat, maxLat, minLng, maxLng } = r.bbox;
      const latRange = maxLat - minLat;
      const lngRange = maxLng - minLng;

      const clusterFactor = rng() < 0.6 ? 1 : 0;
      const clusterLat = minLat + rng() * latRange;
      const clusterLng = minLng + rng() * lngRange;

      const lat = clusterFactor
        ? clusterLat + (rng() - 0.5) * latRange * 0.15
        : minLat + rng() * latRange;
      const lng = clusterFactor
        ? clusterLng + (rng() - 0.5) * lngRange * 0.15
        : minLng + rng() * lngRange;

      const isModis = source === 'MODIS';
      const brightness = isModis
        ? 310 + rng() * 190
        : 300 + rng() * 150;

      const confidence = Math.round(40 + rng() * 60);
      const frp = isModis
        ? 10 + rng() * 250
        : 0.5 + rng() * 80;

      const hour = Math.floor(rng() * 24).toString().padStart(2, '0');
      const minute = Math.floor(rng() * 60).toString().padStart(2, '0');

      hotspots.push({
        id: `${source}-${isoDate(date)}-${i}`,
        source,
        date: isoDate(date),
        lat: Math.round(lat * 10000) / 10000,
        lng: Math.round(lng * 10000) / 10000,
        brightness: Math.round(brightness * 10) / 10,
        confidence,
        frp: Math.round(frp * 10) / 10,
        scan: isModis ? 1 : 0.375,
        track: isModis ? 1 : 0.375,
        acqTime: `${hour}:${minute}`,
      });
    }
    return hotspots;
  };

  const modis = generateHotspots(modisCount, 'MODIS');
  const viirs = generateHotspots(viirsCount, 'VIIRS');

  // A portion of VIIRS detections intentionally samples the same fire events
  // as MODIS. This makes the synthetic dataset reflect the cross-sensor
  // overlap that harmonization is designed to remove.
  const overlapCount = Math.min(
    viirs.length,
    modis.length,
    Math.floor(Math.min(modis.length, viirs.length) * 0.18),
  );
  for (let i = 0; i < overlapCount; i++) {
    viirs[i].lat = Math.round((modis[i].lat + (rng() - 0.5) * 0.006) * 10000) / 10000;
    viirs[i].lng = Math.round((modis[i].lng + (rng() - 0.5) * 0.006) * 10000) / 10000;
  }

  return { modis, viirs };
}

// ─── Harmonization ───────────────────────────────────────────────────────────
//
// Two modes:
// 1. FAST (grid-based) — used for daily summary stats across thousands of days.
//    Groups points into ~1 km grid cells. O(n) instead of O(n²).
// 2. PRECISE (haversine) — used for single-day map visualization only.

// ~1 km in degrees (approximate, varies by latitude but good enough for grid)
const GRID_SIZE_DEG = 0.009; // ~1 km at equator

function gridKey(lat: number, lng: number): string {
  const gLat = Math.floor(lat / GRID_SIZE_DEG);
  const gLng = Math.floor(lng / GRID_SIZE_DEG);
  return `${gLat},${gLng}`;
}

/**
 * FAST grid-based harmonization for daily summaries.
 * Groups all points into ~1 km grid cells and counts unique cells.
 * O(n) complexity — safe for thousands of days.
 */
function harmonizeCountsFast(
  modis: FireHotspot[],
  viirs: FireHotspot[],
): { harmonizedCount: number; totalFRP: number; meanBrightness: number; meanConfidence: number; highConfidenceRatio: number } {
  const grid = new Map<string, { frp: number; brightness: number; confidence: number; count: number }>();

  const allHotspots = [...modis, ...viirs];

  for (const h of allHotspots) {
    const key = gridKey(h.lat, h.lng);
    const existing = grid.get(key);
    if (existing) {
      existing.frp += h.frp;
      existing.brightness = (existing.brightness * existing.count + h.brightness) / (existing.count + 1);
      existing.confidence = Math.max(existing.confidence, h.confidence);
      existing.count += 1;
    } else {
      grid.set(key, { frp: h.frp, brightness: h.brightness, confidence: h.confidence, count: 1 });
    }
  }

  const clusters = Array.from(grid.values());
  const harmonizedCount = clusters.length;
  const totalFRP = clusters.reduce((s, c) => s + c.frp, 0);
  const meanBrightness = harmonizedCount > 0
    ? clusters.reduce((s, c) => s + c.brightness, 0) / harmonizedCount : 0;
  const meanConfidence = harmonizedCount > 0
    ? clusters.reduce((s, c) => s + c.confidence, 0) / harmonizedCount : 0;
  const highConfidenceRatio = harmonizedCount > 0
    ? clusters.filter(c => c.confidence >= 70).length / harmonizedCount : 0;

  return {
    harmonizedCount,
    totalFRP: Math.round(totalFRP),
    meanBrightness: Math.round(meanBrightness * 10) / 10,
    meanConfidence: Math.round(meanConfidence),
    highConfidenceRatio: Math.round(highConfidenceRatio * 100) / 100,
  };
}

/**
 * PRECISE haversine-based harmonization — used only for single-day map layers.
 * O(n × k) where k = number of clusters. Fine for a single day's data.
 */
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function harmonizeHotspotsPrecise(modis: FireHotspot[], viirs: FireHotspot[]): FireHotspot[] {
  const all = [...modis, ...viirs].sort((a, b) => b.confidence - a.confidence);
  const harmonized: (FireHotspot & { _clusterSize: number })[] = [];

  for (const point of all) {
    let clustered = false;
    for (const cluster of harmonized) {
      if (haversine(point.lat, point.lng, cluster.lat, cluster.lng) <= 1.0) {
        cluster.frp += point.frp;
        cluster.brightness =
          (cluster.brightness * cluster._clusterSize + point.brightness) / (cluster._clusterSize + 1);
        cluster._clusterSize += 1;
        clustered = true;
        break;
      }
    }
    if (!clustered) {
      harmonized.push({ ...point, _clusterSize: 1 });
    }
  }

  return harmonized.map((cluster) => {
    const { _clusterSize, ...rest } = cluster;
    void _clusterSize;
    return rest as FireHotspot;
  });
}

// ─── Public API: Generate Full Dataset ───────────────────────────────────────

export interface FireDataset {
  dailySummaries: Map<string, DailyFireSummary>;
  monthlySummaries: MonthlyFireSummary[];
  yearlySummaries: YearlyFireSummary[];
  stats: StatsOverview;
}

const datasetCache = new Map<string, FireDataset>();

export function generateFireDataset(
  region: Region,
  startYear: number,
  endYear: number,
): FireDataset {
  const cacheKey = `${region.id}:${startYear}:${endYear}`;
  const cached = datasetCache.get(cacheKey);
  if (cached) return cached;

  const seed = hashStr(region.id + startYear + '-' + endYear);
  const rng = mulberry32(seed);

  const startDate = new Date(Date.UTC(startYear, 0, 1));
  // Cap end date to today so we don't generate future data
  const today = new Date();
  const maxEndDate = new Date(Date.UTC(endYear, 11, 31));
  const endDate = maxEndDate < today ? maxEndDate : today;
  const dates = dateRange(startDate, endDate);

  const dailySummaries = new Map<string, DailyFireSummary>();

  for (const date of dates) {
    const dNum = dayOfYear(date);
    const magnitude = seasonalFireMagnitude(dNum, region, rng);

    const { modis, viirs } = generateDailyHotspots(date, region, magnitude, rng);
    // Use FAST grid-based harmonization for stats (O(n) per day)
    const harmonized = harmonizeCountsFast(modis, viirs);

    const { intensity, score } = classifyIntensity(
      harmonized.harmonizedCount,
      harmonized.totalFRP,
      harmonized.meanBrightness,
    );

    const summary: DailyFireSummary = {
      date: isoDate(date),
      dayOfYear: dNum,
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      year: date.getUTCFullYear(),
      modisCount: modis.length,
      viirsCount: viirs.length,
      harmonizedCount: harmonized.harmonizedCount,
      totalFRP: harmonized.totalFRP,
      meanBrightness: harmonized.meanBrightness,
      meanConfidence: harmonized.meanConfidence,
      intensity,
      intensityScore: score,
      highConfidenceRatio: harmonized.highConfidenceRatio,
    };

    dailySummaries.set(summary.date, summary);
  }

  // Monthly aggregation
  const monthlySummaries: MonthlyFireSummary[] = [];
  const monthlyMap = new Map<string, DailyFireSummary[]>();

  for (const summary of dailySummaries.values()) {
    const key = `${summary.year}-${summary.month}`;
    if (!monthlyMap.has(key)) monthlyMap.set(key, []);
    monthlyMap.get(key)!.push(summary);
  }

  for (const [key, summaries] of monthlyMap) {
    const [year, month] = key.split('-').map(Number);
    const harmonizedCount = summaries.reduce((s, d) => s + d.harmonizedCount, 0);
    const totalFRP = summaries.reduce((s, d) => s + d.totalFRP, 0);
    const modisCount = summaries.reduce((s, d) => s + d.modisCount, 0);
    const viirsCount = summaries.reduce((s, d) => s + d.viirsCount, 0);

    const { intensity } = classifyIntensity(
      harmonizedCount,
      totalFRP,
      summaries.reduce((s, d) => s + d.meanBrightness, 0) / summaries.length,
    );

    monthlySummaries.push({
      year, month, harmonizedCount, totalFRP, modisCount, viirsCount,
      anomalyScore: 0, intensity,
    });
  }

  monthlySummaries.sort((a, b) => a.year - b.year || a.month - b.month);

  // Yearly aggregation
  const yearlySummaries: YearlyFireSummary[] = [];
  const yearlyMap = new Map<number, DailyFireSummary[]>();

  for (const summary of dailySummaries.values()) {
    if (!yearlyMap.has(summary.year)) yearlyMap.set(summary.year, []);
    yearlyMap.get(summary.year)!.push(summary);
  }

  for (const [year, summaries] of yearlyMap) {
    const harmonizedCount = summaries.reduce((s, d) => s + d.harmonizedCount, 0);
    const totalFRP = summaries.reduce((s, d) => s + d.totalFRP, 0);
    const modisCount = summaries.reduce((s, d) => s + d.modisCount, 0);
    const viirsCount = summaries.reduce((s, d) => s + d.viirsCount, 0);

    let peakDay: string | null = null;
    let peakCount = 0;
    for (const s of summaries) {
      if (s.harmonizedCount > peakCount) {
        peakCount = s.harmonizedCount;
        peakDay = s.date;
      }
    }

    yearlySummaries.push({
      year, harmonizedCount, totalFRP, modisCount, viirsCount, peakDay,
      anomalyScore: 0,
    });
  }

  yearlySummaries.sort((a, b) => a.year - b.year);

  // Stats overview
  const allSummaries = Array.from(dailySummaries.values());
  const totalHotspots = allSummaries.reduce((s, d) => s + d.harmonizedCount, 0);
  const totalFRP = allSummaries.reduce((s, d) => s + d.totalFRP, 0);
  const rawTotal = allSummaries.reduce((s, d) => s + d.modisCount + d.viirsCount, 0);

  let peakDayCount = 0;
  let peakDayDate: string | null = null;
  for (const s of allSummaries) {
    if (s.harmonizedCount > peakDayCount) {
      peakDayCount = s.harmonizedCount;
      peakDayDate = s.date;
    }
  }

  const stats: StatsOverview = {
    totalHotspots,
    totalFRP,
    meanDailyHotspots: Math.round(totalHotspots / Math.max(allSummaries.length, 1)),
    peakDayCount,
    peakDayDate,
    anomalyCount: 0,
    harmonizationDelta: rawTotal - totalHotspots,
  };

  const dataset = { dailySummaries, monthlySummaries, yearlySummaries, stats };
  datasetCache.set(cacheKey, dataset);
  return dataset;
}

// ─── Geo Hotspots (for map visualization) ────────────────────────────────────

export interface GeoHotspot {
  lat: number;
  lng: number;
  brightness: number;
  confidence: number;
  frp: number;
  source: SatelliteSource;
}

export function generateGeoHotspots(
  region: Region,
  dateStr: string,
  maxPoints = 500,
): GeoHotspot[] {
  const seed = hashStr(region.id + dateStr);
  const rng = mulberry32(seed);

  const date = new Date(dateStr + 'T00:00:00Z');
  const dNum = dayOfYear(date);
  const magnitude = seasonalFireMagnitude(dNum, region, rng);

  const { modis, viirs } = generateDailyHotspots(date, region, magnitude, rng);

  const all: GeoHotspot[] = [...modis, ...viirs].map((h) => ({
    lat: h.lat, lng: h.lng,
    brightness: h.brightness, confidence: h.confidence,
    frp: h.frp, source: h.source,
  }));

  all.sort((a, b) => b.frp - a.frp);
  return all.slice(0, maxPoints);
}

/**
 * Generate MODIS, VIIRS, and Harmonized layers for a SINGLE day.
 * Uses precise haversine clustering — only called for map display.
 */
export function generateGeoHotspotsWithLayers(
  region: Region,
  dateStr: string,
  maxPoints = 300,
): { modis: GeoHotspot[]; viirs: GeoHotspot[]; harmonized: GeoHotspot[] } {
  const seed = hashStr(region.id + dateStr);
  const rng = mulberry32(seed);

  const date = new Date(dateStr + 'T00:00:00Z');
  const dNum = dayOfYear(date);
  const magnitude = seasonalFireMagnitude(dNum, region, rng);

  const { modis, viirs } = generateDailyHotspots(date, region, magnitude, rng);

  const harmonizedFull = harmonizeHotspotsPrecise(modis, viirs);

  const toGeoHotspot = (h: FireHotspot): GeoHotspot => ({
    lat: h.lat, lng: h.lng,
    brightness: h.brightness, confidence: h.confidence,
    frp: h.frp, source: h.source,
  });

  const modisGeo = modis.map(toGeoHotspot).sort((a, b) => b.frp - a.frp).slice(0, maxPoints);
  const viirsGeo = viirs.map(toGeoHotspot).sort((a, b) => b.frp - a.frp).slice(0, maxPoints);
  const harmonizedGeo = harmonizedFull.map(toGeoHotspot).sort((a, b) => b.frp - a.frp).slice(0, maxPoints);

  return { modis: modisGeo, viirs: viirsGeo, harmonized: harmonizedGeo };
}

// ─── Trend Points ────────────────────────────────────────────────────────────

export function computeTrendPoints(
  dailySummaries: Map<string, DailyFireSummary>,
  startDate: string,
  endDate: string,
): TrendPoint[] {
  const points: TrendPoint[] = [];
  const rollingWindow: number[] = [];

  const start = new Date(startDate);
  const end = new Date(endDate);
  const dates = dateRange(start, end);

  for (const date of dates) {
    const key = isoDate(date);
    const summary = dailySummaries.get(key);

    if (summary) {
      rollingWindow.push(summary.harmonizedCount);
      if (rollingWindow.length > 7) rollingWindow.shift();

      const rolling7 =
        rollingWindow.reduce((s, v) => s + v, 0) / rollingWindow.length;

      points.push({
        date: key,
        harmonizedCount: summary.harmonizedCount,
        modisCount: summary.modisCount,
        viirsCount: summary.viirsCount,
        totalFRP: summary.totalFRP,
        rolling7: Math.round(rolling7 * 10) / 10,
      });
    }
  }

  return points;
}
