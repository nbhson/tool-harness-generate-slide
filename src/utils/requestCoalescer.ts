import { logger } from './logger';
import * as crypto from 'crypto';

const log = logger.child('RequestCoalescer');

/**
 * Request Coalescer / Deduplication
 * 
 * Prevents duplicate in-flight requests. If multiple callers request the
 * same content simultaneously, only one LLM call is made and the result
 * is shared across all callers.
 * 
 * Useful when parallel slide generation produces similar prompts.
 */
export class RequestCoalescer {
  private pending = new Map<string, { promise: Promise<any>; timestamp: number }>();
  private completedCache = new Map<string, { data: any; timestamp: number }>();
  private ttlMs: number;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(ttlMs: number = 60_000) {
    this.ttlMs = ttlMs;

    // Cleanup expired entries every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60_000);
  }

  /**
   * Execute a function, but deduplicate based on key.
   * If an identical request is already in-flight, returns the same Promise.
   */
  async deduplicate<T>(key: string, fn: () => Promise<T>): Promise<T> {
    // Check completed cache first
    const cached = this.completedCache.get(key);
    if (cached && Date.now() - cached.timestamp < this.ttlMs) {
      log.debug('Cache hit', { key: key.substring(0, 30) });
      return cached.data as T;
    }

    // Check if request is already in-flight
    const pending = this.pending.get(key);
    if (pending) {
      log.debug('Request coalesced (in-flight)', { key: key.substring(0, 30) });
      return pending.promise as Promise<T>;
    }

    // Execute new request
    log.debug('New request', { key: key.substring(0, 30) });
    const promise = fn()
      .then((result) => {
        this.completedCache.set(key, { data: result, timestamp: Date.now() });
        this.pending.delete(key);
        return result;
      })
      .catch((error) => {
        this.pending.delete(key);
        throw error;
      });

    this.pending.set(key, { promise, timestamp: Date.now() });
    return promise;
  }

  /**
   * Generate a cache key from content (SHA-256 hash truncated to 16 chars)
   */
  static hash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
  }

  /**
   * Clear expired entries
   */
  private cleanup(): void {
    const now = Date.now();

    for (const [key, entry] of this.completedCache) {
      if (now - entry.timestamp >= this.ttlMs) {
        this.completedCache.delete(key);
      }
    }

    // Remove stale in-flight requests (older than 2 minutes)
    for (const [key, entry] of this.pending) {
      if (now - entry.timestamp > 120_000) {
        this.pending.delete(key);
        log.warn('Removed stale pending request', { key: key.substring(0, 30) });
      }
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): { pending: number; cached: number } {
    return {
      pending: this.pending.size,
      cached: this.completedCache.size,
    };
  }

  /**
   * Clear all caches
   */
  clear(): void {
    this.pending.clear();
    this.completedCache.clear();
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clear();
  }
}