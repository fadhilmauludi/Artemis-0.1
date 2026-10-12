export interface CurrentWeather {
  locationName: string;
  temperatureCelsius: number;
  humidityPercent: number;
  windSpeedMetersPerSecond: number;
  windDirectionDegrees: number;
  windDirectionLabel: string;
  condition: string;
  observedAt: number;
}

interface OpenWeatherResponse {
  name?: unknown;
  dt?: unknown;
  main?: {
    temp?: unknown;
    humidity?: unknown;
  };
  wind?: {
    speed?: unknown;
    deg?: unknown;
  };
  weather?: Array<{
    description?: unknown;
  }>;
}

// Served by our own /api/weather proxy (the API key stays on the server).
const WEATHER_URL = '/api/weather';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function toCompassDirection(degrees: number): string {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return directions[Math.round(degrees / 45) % directions.length];
}

export async function fetchCurrentWeather(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<CurrentWeather> {
  if (
    !isFiniteNumber(latitude) ||
    !isFiniteNumber(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new Error('The selected hotspot has invalid coordinates.');
  }

  const params = new URLSearchParams({
    lat: latitude.toString(),
    lon: longitude.toString(),
  });
  const response = await fetch(`${WEATHER_URL}?${params.toString()}`, { signal });

  if (!response.ok) {
    throw new Error(`OpenWeatherMap request failed (${response.status}).`);
  }

  const data = await response.json() as OpenWeatherResponse;
  const temperature = data.main?.temp;
  const humidity = data.main?.humidity;
  const windSpeed = data.wind?.speed;
  const windDirection = data.wind?.deg;

  if (
    !isFiniteNumber(temperature) ||
    !isFiniteNumber(humidity) ||
    !isFiniteNumber(windSpeed) ||
    !isFiniteNumber(windDirection)
  ) {
    throw new Error('OpenWeatherMap returned an incomplete weather response.');
  }

  return {
    locationName: typeof data.name === 'string' && data.name ? data.name : 'Selected hotspot',
    temperatureCelsius: temperature,
    humidityPercent: humidity,
    windSpeedMetersPerSecond: windSpeed,
    windDirectionDegrees: windDirection,
    windDirectionLabel: toCompassDirection(windDirection),
    condition: typeof data.weather?.[0]?.description === 'string'
      ? data.weather[0].description
      : 'Current conditions',
    observedAt: isFiniteNumber(data.dt) ? data.dt * 1000 : Date.now(),
  };
}
