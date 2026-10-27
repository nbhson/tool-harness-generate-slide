import { logger } from '../../utils/logger';
import * as crypto from 'crypto';

const log = logger.child('ResponseCache');

export interface CacheConfig {
  /** Default TTL in milliseconds. Default: 3600000 (1 hour) */
  ttlMs: number;
  /** Maximum number of entries. Default: 500 */
  maxEntries: number;
  /** Enable cache. Default: true */
  enabled: boolean;
}

const defaultConfig: CacheConfig = {
  ttlMs: 3_600_000, // 1 hour
  maxEntries: 500,
  enabled: true,
};

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  hits: number;
}

/**
 * Response Cache for LLM responses.
 *
 * Caches by content hash to avoid redundant LLM calls for identical prompts.
 * Uses TTL-based expiry and LRU-like eviction.
 *
 * Usage:
 *   const cache = new ResponseCache();
 *   const result = await cache.getOrCompute(promptHash, () => callLLM(prompt));
 */
export class ResponseCache {
  private cache = new Map<string, CacheEntry<any>>();
  private config: CacheConfig;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...defaultConfig, ...config };

    if (this.config.enabled) {
      this.cleanupInterval = setInterval(() => this.cleanup(), 60_000);
    }
  }

  /**
   * Get cached result or compute and cache.
   */
  async getOrCompute<T>(key: string, compute: () => Promise<T>, ttlMs?: number): Promise<T> {
    if (!this.config.enabled) {
      return compute();
    }

    const entry = this.cache.get(key);
    if (entry && Date.now() - entry.timestamp < (ttlMs || this.config.ttlMs)) {
      entry.hits++;
      log.debug('Cache hit', { key: key.substring(0, 30), hits: entry.hits });
      return entry.data as T;
    }

    // Compute and cache
    const data = await compute();
    this.set(key, data, ttlMs);
    return data;
  }

  /**
   * Store a value in cache.
   */
  set<T>(key: string, data: T, _ttlMs?: number): void {
    if (!this.config.enabled) return;

    // Evict if at capacity
    if (this.cache.size >= this.config.maxEntries) {
      this.evictLeastUsed();
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      hits: 0,
    });
  }

  /**
   * Get a value from cache.
   */
  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() - entry.timestamp >= this.config.ttlMs) {
      this.cache.delete(key);
      return undefined;
    }

    entry.hits++;
    return entry.data as T;
  }

  /**
   * Check if a key exists and is not expired.
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() - entry.timestamp >= this.config.ttlMs) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Generate cache key from prompt content (SHA-256 hash).
   */
  static hash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
  }

  /**
   * Get cache statistics.
   */
  getStats(): { size: number; enabled: boolean; hitRate: string } {
    let totalHits = 0;
    let totalAccesses = 0;
    for (const entry of this.cache.values()) {
      totalHits += entry.hits;
      totalAccesses += entry.hits + 1;
    }
    return {
      size: this.cache.size,
      enabled: this.config.enabled,
      hitRate: totalAccesses > 0 ? `${((totalHits / totalAccesses) * 100).toFixed(1)}%` : '0%',
    };
  }

  /**
   * Remove least used entries when at capacity.
   */
  private evictLeastUsed(): void {
    let minHits = Infinity;
    let minKey = '';
    for (const [key, entry] of this.cache) {
      if (entry.hits < minHits) {
        minHits = entry.hits;
        minKey = key;
      }
    }
    if (minKey) {
      this.cache.delete(minKey);
      log.debug('Evicted least used entry', { key: minKey.substring(0, 30) });
    }
  }

  /**
   * Cleanup expired entries.
   */
  private cleanup(): void {
    const now = Date.now();
    let evicted = 0;
    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp >= this.config.ttlMs) {
        this.cache.delete(key);
        evicted++;
      }
    }
    if (evicted > 0) {
      log.debug('Cache cleanup', { evicted, remaining: this.cache.size });
    }
  }

  /**
   * Clear all cache entries.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Cleanup resources.
   */
  dispose(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clear();
  }
}
