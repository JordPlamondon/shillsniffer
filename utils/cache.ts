import { storage } from 'wxt/storage';
import type { AnalysisResult, ConfidenceLevel } from './types';
import { log } from './debug';

const CACHE_KEY = 'local:analysisCache';
const MAX_CACHE_SIZE = 500;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface CachedAnalysis {
  confidence: ConfidenceLevel;
  hasCommercialInterest: boolean;
  isDisclosed: boolean;
  explanation: string;
  businessConnection: string;
  timestamp: number;
}

type CacheStore = Record<string, CachedAnalysis>;

const cacheStorage = storage.defineItem<CacheStore>(CACHE_KEY, {
  fallback: {},
});

function hashTopic(text: string): string {
  const truncated = text.slice(0, 50).toLowerCase().trim();
  let hash = 0;
  for (let i = 0; i < truncated.length; i++) {
    const char = truncated.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

export function getCacheKey(authorHandle: string, tweetText: string): string {
  const topicHash = hashTopic(tweetText);
  return `${authorHandle.toLowerCase()}:${topicHash}`;
}

function isValid(entry: CachedAnalysis): boolean {
  return Date.now() - entry.timestamp < CACHE_TTL_MS;
}

export async function getCachedResult(
  authorHandle: string,
  tweetText: string
): Promise<CachedAnalysis | null> {
  const cache = await cacheStorage.getValue();
  const key = getCacheKey(authorHandle, tweetText);
  const entry = cache[key];

  if (entry && isValid(entry)) {
    log(' Cache] Hit:', key);
    return entry;
  }

  if (entry) {
    log(' Cache] Expired:', key);
  }

  return null;
}

export function cachedToResult(cached: CachedAnalysis): AnalysisResult {
  return {
    confidence: cached.confidence,
    hasCommercialInterest: cached.hasCommercialInterest,
    isDisclosed: cached.isDisclosed,
    explanation: cached.explanation,
    businessConnection: cached.businessConnection,
  };
}

export async function cacheResult(
  authorHandle: string,
  tweetText: string,
  result: AnalysisResult
): Promise<void> {
  const cache = await cacheStorage.getValue();
  const key = getCacheKey(authorHandle, tweetText);

  const entry: CachedAnalysis = {
    confidence: result.confidence,
    hasCommercialInterest: result.hasCommercialInterest,
    isDisclosed: result.isDisclosed,
    explanation: result.explanation,
    businessConnection: result.businessConnection,
    timestamp: Date.now(),
  };

  cache[key] = entry;

  const keys = Object.keys(cache);
  if (keys.length > MAX_CACHE_SIZE) {
    const sorted = keys
      .map(k => ({ key: k, ts: cache[k].timestamp }))
      .sort((a, b) => a.ts - b.ts);

    const toRemove = sorted.slice(0, keys.length - MAX_CACHE_SIZE);
    for (const { key: k } of toRemove) {
      delete cache[k];
    }

    log(` Cache] Pruned ${toRemove.length} old entries`);
  }

  await cacheStorage.setValue(cache);
  log(' Cache] Stored:', key);
}

export async function getCacheStats(): Promise<{ count: number; oldestAge: number | null }> {
  const cache = await cacheStorage.getValue();
  const entries = Object.values(cache);

  if (entries.length === 0) {
    return { count: 0, oldestAge: null };
  }

  const now = Date.now();
  const oldest = Math.min(...entries.map(e => e.timestamp));
  const oldestAge = Math.floor((now - oldest) / (1000 * 60 * 60 * 24));

  return { count: entries.length, oldestAge };
}

export async function clearCache(): Promise<void> {
  await cacheStorage.setValue({});
  log(' Cache] Cleared');
}

export async function pruneExpired(): Promise<number> {
  const cache = await cacheStorage.getValue();
  const now = Date.now();
  let removed = 0;

  for (const [key, entry] of Object.entries(cache)) {
    if (now - entry.timestamp >= CACHE_TTL_MS) {
      delete cache[key];
      removed++;
    }
  }

  if (removed > 0) {
    await cacheStorage.setValue(cache);
    log(` Cache] Pruned ${removed} expired entries`);
  }

  return removed;
}
