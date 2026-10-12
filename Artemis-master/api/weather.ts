// Serverless proxy for OpenWeatherMap current weather (keeps the API key server-side).

function json(body: unknown, status: number, cache = 'no-store'): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache },
  });
}

export async function GET(request: Request): Promise<Response> {
  const key = process.env.OPENWEATHER_API_KEY ?? process.env.VITE_OPENWEATHER_API_KEY;
  if (!key) return json({ error: 'OPENWEATHER_API_KEY is not configured on the server.' }, 500);

  const params = new URL(request.url).searchParams;
  const lat = Number(params.get('lat'));
  const lon = Number(params.get('lon'));
  if (
    params.get('lat') === null || params.get('lon') === null ||
    !Number.isFinite(lat) || !Number.isFinite(lon) ||
    lat < -90 || lat > 90 || lon < -180 || lon > 180
  ) {
    return json({ error: 'Invalid coordinates.' }, 400);
  }

  // Round to ~1 km so nearby hotspots share one cached upstream call.
  const query = new URLSearchParams({
    lat: lat.toFixed(2),
    lon: lon.toFixed(2),
    appid: key,
    units: 'metric',
  });
  try {
    const upstream = await fetch(`https://api.openweathermap.org/data/2.5/weather?${query}`);
    if (!upstream.ok) return json({ error: `OpenWeatherMap request failed (${upstream.status}).` }, upstream.status);
    return json(await upstream.json(), 200, 'public, max-age=300, s-maxage=600, stale-while-revalidate=600');
  } catch {
    return json({ error: 'Could not reach OpenWeatherMap.' }, 502);
  }
}
