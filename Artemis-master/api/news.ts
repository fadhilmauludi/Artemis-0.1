// Serverless proxy for NewsData.io wildfire news (keeps the API key server-side).

function json(body: unknown, status: number, cache = 'no-store'): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache },
  });
}

export async function GET(): Promise<Response> {
  const key = process.env.NEWSDATA_API_KEY ?? process.env.VITE_NEWSDATA_API_KEY;
  if (!key) return json({ status: 'error', error: 'NEWSDATA_API_KEY is not configured on the server.' }, 500);

  const query = new URLSearchParams({
    apikey: key,
    q: 'wildfire OR "forest fire" OR "kebakaran hutan"',
    language: 'id,en',
    category: 'environment',
    size: '10',
  });
  try {
    const upstream = await fetch(`https://newsdata.io/api/1/news?${query}`);
    const data = await upstream.json().catch(() => null);
    if (!upstream.ok || !data) {
      return json({ status: 'error', error: `NewsData.io request failed (${upstream.status}).` }, upstream.ok ? 502 : upstream.status);
    }
    return json(data, 200, 'public, max-age=300, s-maxage=1800, stale-while-revalidate=1800');
  } catch {
    return json({ status: 'error', error: 'Could not reach NewsData.io.' }, 502);
  }
}
