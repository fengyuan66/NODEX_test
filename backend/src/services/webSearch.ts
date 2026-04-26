import axios from 'axios';

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_MAX_RESULTS = 3;

function parseEnvInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeSpace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&nbsp;': ' ',
  };
  return value
    .replace(/&(amp|lt|gt|quot|nbsp);|&#39;/g, (match) => named[match] ?? match)
    .replace(/&#(\d+);/g, (_, num: string) => {
      const codePoint = Number.parseInt(num, 10);
      return Number.isFinite(codePoint) ? String.fromCharCode(codePoint) : _;
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => {
      const codePoint = Number.parseInt(hex, 16);
      return Number.isFinite(codePoint) ? String.fromCharCode(codePoint) : _;
    });
}

function stripHtml(value: string): string {
  return normalizeSpace(decodeHtmlEntities(value.replace(/<[^>]+>/g, ' ')));
}

function resolveDuckDuckGoRedirect(rawHref: string): string {
  if (!rawHref) return '';
  try {
    const href = rawHref.startsWith('//') ? `https:${rawHref}` : rawHref;
    const url = new URL(href, 'https://duckduckgo.com');
    const redirected = url.searchParams.get('uddg');
    if (redirected) {
      return decodeURIComponent(redirected);
    }
    return url.toString();
  } catch {
    return rawHref;
  }
}

function parseDuckDuckGoHtml(html: string, maxResults: number): WebSearchResult[] {
  const anchorRegex = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRegex = /<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>|<div[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/div>/i;
  const results: WebSearchResult[] = [];
  const seen = new Set<string>();

  let match: RegExpExecArray | null;
  while ((match = anchorRegex.exec(html)) && results.length < maxResults) {
    const href = resolveDuckDuckGoRedirect(match[1]);
    if (!/^https?:\/\//i.test(href)) continue;
    if (seen.has(href)) continue;

    const title = stripHtml(match[2]);
    if (!title) continue;

    const nearby = html.slice(match.index, match.index + 1_600);
    const snippetMatch = nearby.match(snippetRegex);
    const snippet = stripHtml((snippetMatch?.[1] || snippetMatch?.[2] || '').trim()).slice(0, 240);

    seen.add(href);
    results.push({
      title,
      url: href,
      snippet,
    });
  }

  return results;
}

export function isWebSearchEnabled(): boolean {
  const raw = (process.env.WEB_SEARCH_ENABLED || '').trim().toLowerCase();
  if (!raw) return true;
  return !['0', 'false', 'no', 'off'].includes(raw);
}

export function getWebSearchMaxResults(): number {
  return parseEnvInt('WEB_SEARCH_MAX_RESULTS', DEFAULT_MAX_RESULTS, 1, 6);
}

export function getWebSearchTimeoutMs(): number {
  return parseEnvInt('WEB_SEARCH_TIMEOUT_MS', DEFAULT_TIMEOUT_MS, 2_000, 30_000);
}

export async function searchWeb(query: string): Promise<WebSearchResult[]> {
  if (!isWebSearchEnabled()) return [];
  const normalizedQuery = normalizeSpace(query).slice(0, 320);
  if (!normalizedQuery) return [];

  try {
    const response = await axios.get<string>('https://duckduckgo.com/html/', {
      params: { q: normalizedQuery },
      timeout: getWebSearchTimeoutMs(),
      responseType: 'text',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    return parseDuckDuckGoHtml(response.data, getWebSearchMaxResults());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('[web-search] search failed:', message);
    return [];
  }
}
