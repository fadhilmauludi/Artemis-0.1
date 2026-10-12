// Serverless proxy for NASA FIRMS.
// - Keeps the MAP_KEY on the server (never shipped to the browser).
// - FIRMS does not send CORS headers, so the browser cannot call it directly.
// - Streams the CSV and keeps only the requested date + the columns the app uses,
//   so the response stays small and never has to be buffered in memory.

const PRODUCTS = new Set(['MODIS_NRT', 'VIIRS_NOAA21_NRT', 'VIIRS_SNPP_NRT']);
const OUT_COLUMNS = [
  'latitude', 'longitude', 'brightness', 'bright_ti4', 'scan', 'track',
  'acq_date', 'acq_time', 'confidence', 'frp',
];
const REQUIRED = ['latitude', 'longitude', 'acq_date', 'frp'];

function text(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export async function GET(request: Request): Promise<Response> {
  const key = process.env.FIRMS_API_KEY ?? process.env.VITE_FIRMS_API_KEY;
  if (!key) return text('FIRMS_API_KEY is not configured on the server.', 500);

  const params = new URL(request.url).searchParams;
  const product = params.get('product') ?? '';
  const days = Number(params.get('days') ?? 5);
  const date = params.get('date') ?? '';
  if (
    !PRODUCTS.has(product) ||
    !Number.isInteger(days) || days < 1 || days > 5 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date)
  ) {
    return text('Invalid query parameters.', 400);
  }

  let upstream: Response;
  try {
    upstream = await fetch(
      `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key}/${product}/world/${days}/${date}`,
    );
  } catch {
    return text('Could not reach NASA FIRMS.', 502);
  }
  if (!upstream.ok || !upstream.body) {
    const body = await upstream.text().catch(() => '');
    return text(body.slice(0, 300) || 'NASA FIRMS request failed.', upstream.ok ? 502 : upstream.status);
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';

  // Read until the header line so we can reject error pages (e.g. "Invalid MAP_KEY").
  let headerLine: string | null = null;
  while (headerLine === null) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const newline = buffer.indexOf('\n');
    if (newline >= 0) {
      headerLine = buffer.slice(0, newline).replace(/\r$/, '');
      buffer = buffer.slice(newline + 1);
    }
  }
  if (headerLine === null) {
    headerLine = buffer.trim();
    buffer = '';
  }
  const headers = headerLine.split(',').map((h) => h.trim());
  if (REQUIRED.some((column) => !headers.includes(column))) {
    return text(headerLine.slice(0, 300) || 'NASA FIRMS returned an empty response.', 502);
  }

  const columnIndex = OUT_COLUMNS.map((column) => headers.indexOf(column));
  const dateIndex = headers.indexOf('acq_date');
  const convert = (line: string): string => {
    if (!line) return '';
    const values = line.split(',');
    if (values[dateIndex]?.trim() !== date) return '';
    return columnIndex.map((i) => (i >= 0 ? (values[i] ?? '').trim() : '')).join(',') + '\n';
  };

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(OUT_COLUMNS.join(',') + '\n'));
    },
    async pull(controller) {
      // Keep reading until we have something to emit (a chunk may contain only other dates).
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) {
          buffer += decoder.decode();
          const last = convert(buffer.replace(/\r$/, ''));
          if (last) controller.enqueue(encoder.encode(last));
          buffer = '';
          controller.close();
          return;
        }
        buffer += decoder.decode(chunk.value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        let out = '';
        for (const line of lines) out += convert(line.replace(/\r$/, ''));
        if (out) {
          controller.enqueue(encoder.encode(out));
          return;
        }
      }
    },
    cancel() {
      return reader.cancel();
    },
  });

  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=1800, stale-while-revalidate=600',
    },
  });
}
