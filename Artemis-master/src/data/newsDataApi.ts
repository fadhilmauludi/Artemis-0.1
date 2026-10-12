export interface DisasterNewsArticle {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  publishedAt: string;
  link: string;
  sourceName: string;
  language: string;
}

interface NewsDataResponse {
  status?: unknown;
  results?: Array<{
    article_id?: unknown;
    title?: unknown;
    description?: unknown;
    image_url?: unknown;
    pubDate?: unknown;
    link?: unknown;
    source_name?: unknown;
    language?: unknown;
  }>;
}

// Served by our own /api/news proxy (the API key and query live on the server).
const NEWS_URL = '/api/news';
const CACHE_KEY = 'artemis-newsdata-wildfire:v2';
const CACHE_TTL_MS = 30 * 60 * 1000;

interface CachedArticles {
  savedAt: number;
  articles: DisasterNewsArticle[];
}

function readCache(): DisasterNewsArticle[] | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(CACHE_KEY);
  if (!raw) return null;

  try {
    const cached = JSON.parse(raw) as CachedArticles;
    if (
      !Number.isFinite(cached.savedAt) ||
      Date.now() - cached.savedAt > CACHE_TTL_MS ||
      !Array.isArray(cached.articles)
    ) {
      window.localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return cached.articles;
  } catch {
    window.localStorage.removeItem(CACHE_KEY);
    return null;
  }
}

function writeCache(articles: DisasterNewsArticle[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(CACHE_KEY, JSON.stringify({
    savedAt: Date.now(),
    articles,
  } satisfies CachedArticles));
}

function mapArticles(response: NewsDataResponse): DisasterNewsArticle[] {
  return (response.results ?? []).flatMap((item, index) => {
    if (
      typeof item.title !== 'string' ||
      !item.title.trim() ||
      typeof item.link !== 'string' ||
      typeof item.pubDate !== 'string'
    ) {
      return [];
    }

    const description = typeof item.description === 'string' ? item.description : '';
    const searchableText = `${item.title} ${description}`.toLowerCase();
    const isWildfireRelated = /(wildfire|wild fire|forest fire|bushfire|kebakaran hutan|kebakaran lahan|kebakaran gambut)/i.test(searchableText);
    if (!isWildfireRelated) return [];

    return [{
      id: typeof item.article_id === 'string' ? item.article_id : `${item.link}-${index}`,
      title: item.title,
      description,
      imageUrl: typeof item.image_url === 'string' && item.image_url
        ? item.image_url
        : '',
      publishedAt: item.pubDate,
      link: item.link,
      sourceName: typeof item.source_name === 'string' && item.source_name
        ? item.source_name
        : 'NewsData.io',
      language: typeof item.language === 'string' ? item.language.toUpperCase() : '—',
    }];
  });
}

export async function fetchDisasterNews(signal?: AbortSignal): Promise<DisasterNewsArticle[]> {
  const cached = readCache();
  if (cached) return cached;
  const response = await fetch(NEWS_URL, { signal });
  const data = await response.json().catch(() => ({ status: 'error' })) as NewsDataResponse & { results?: unknown };

  if (!response.ok || data.status === 'error') {
    throw new Error(`NewsData.io request failed (${response.status}).`);
  }

  const articles = mapArticles(data);
  writeCache(articles);
  return articles;
}
