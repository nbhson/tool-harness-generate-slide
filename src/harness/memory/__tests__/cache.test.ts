import { describe, it, expect, vi } from 'vitest';
import { ResponseCache } from '../cache';

describe('ResponseCache', () => {
  it('should compute and store value on cache miss', async () => {
    const cache = new ResponseCache({ ttlMs: 1000, enabled: true });
    const computeFn = vi.fn().mockResolvedValue('computed_result');

    const result = await cache.getOrCompute('key1', computeFn);

    expect(result).toBe('computed_result');
    expect(computeFn).toHaveBeenCalledTimes(1);
    expect(cache.getStats().size).toBe(1);
    cache.dispose();
  });

  it('should return cached value on cache hit', async () => {
    const cache = new ResponseCache({ ttlMs: 1000, enabled: true });
    const computeFn = vi.fn().mockResolvedValue('computed_result');

    await cache.getOrCompute('key1', computeFn);
    const cached = await cache.getOrCompute('key1', computeFn);

    expect(cached).toBe('computed_result');
    expect(computeFn).toHaveBeenCalledTimes(1);
    cache.dispose();
  });

  it('should expire entry after TTL', async () => {
    vi.useFakeTimers();
    const cache = new ResponseCache({ ttlMs: 100, enabled: true });
    const computeFn = vi.fn().mockResolvedValue('fresh_data');

    await cache.getOrCompute('key1', computeFn);

    vi.advanceTimersByTime(150);

    await cache.getOrCompute('key1', computeFn);

    expect(computeFn).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
    cache.dispose();
  });

  it('should compute deterministic MD5/SHA256 hash for prompt', () => {
    const hash1 = ResponseCache.hash('prompt text');
    const hash2 = ResponseCache.hash('prompt text');
    const hash3 = ResponseCache.hash('different prompt');

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hash3);
  });
});
