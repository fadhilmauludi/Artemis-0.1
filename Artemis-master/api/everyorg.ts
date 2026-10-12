// Serverless proxy for the Every.org nonprofit search (keeps the API key server-side).

function json(body: unknown, status: number, cache = 'no-store'): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache },
  });
}

export async function GET(request: Request): Promise<Response> {
  const key = process.env.EVERY_ORG_API_KEY ?? process.env.VITE_EVERY_ORG_API_KEY;
  if (!key) return json({ error: 'EVERY_ORG_API_KEY is not configured on the server.' }, 500);

  const term = (new URL(request.url).searchParams.get('term') ?? '').trim();
  if (!term || term.length > 100) return json({ error: 'Invalid search term.' }, 400);

  const query = new URLSearchParams({ apiKey: key, take: '4', causes: 'wildfires' });
  try {
    const upstream = await fetch(
      `https://partners.every.org/v0.2/search/${encodeURIComponent(term)}?${query}`,
    );
    if (!upstream.ok) return json({ error: `Every.org request failed (${upstream.status}).` }, upstream.status);
    return json(await upstream.json(), 200, 'public, max-age=600, s-maxage=3600, stale-while-revalidate=3600');
  } catch {
    return json({ error: 'Could not reach Every.org.' }, 502);
  }
}
