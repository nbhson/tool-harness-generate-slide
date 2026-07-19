import { describe, it, expect, vi } from 'vitest';
import { RequestCoalescer } from '../requestCoalescer';

describe('RequestCoalescer', () => {
  it('should deduplicate concurrent in-flight requests with identical keys', async () => {
    const coalescer = new RequestCoalescer();
    const fn = vi.fn().mockImplementation(async () => {
      await new Promise(r => setTimeout(r, 50));
      return { result: 'data' };
    });

    const promise1 = coalescer.deduplicate('key1', fn);
    const promise2 = coalescer.deduplicate('key1', fn);

    expect(coalescer.getStats().pending).toBe(1);

    const [res1, res2] = await Promise.all([promise1, promise2]);

    expect(res1).toBe(res2);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(coalescer.getStats().pending).toBe(0);
    coalescer.dispose();
  });

  it('should execute separate calls for different keys', async () => {
    const coalescer = new RequestCoalescer();
    const fn1 = vi.fn().mockResolvedValue('val1');
    const fn2 = vi.fn().mockResolvedValue('val2');

    const res1 = await coalescer.deduplicate('key1', fn1);
    const res2 = await coalescer.deduplicate('key2', fn2);

    expect(res1).toBe('val1');
    expect(res2).toBe('val2');
    expect(fn1).toHaveBeenCalledTimes(1);
    expect(fn2).toHaveBeenCalledTimes(1);
    coalescer.dispose();
  });

  it('should return cached result for repeated deduplicate call within TTL', async () => {
    const coalescer = new RequestCoalescer(60_000);
    const fn = vi.fn().mockResolvedValue('data');

    const res1 = await coalescer.deduplicate('key1', fn);
    const res2 = await coalescer.deduplicate('key1', fn);

    expect(res1).toBe('data');
    expect(res2).toBe('data');
    expect(fn).toHaveBeenCalledTimes(1); // Cached, function not re-invoked
    coalescer.dispose();
  });
});
