import { describe, expect, it } from 'vitest';
import { WorkerPool } from '../workerPool';
import type { TextChunker } from '../textChunker';

describe('WorkerPool', () => {
  it('reports status with available workers', () => {
    const pool = new WorkerPool(2);
    const status = pool.getStatus();
    expect(status.maxWorkers).toBe(2);
    expect(status.available).toBe(true);
  });

  it('defaults maxWorkers to at least 1', () => {
    const pool = new WorkerPool();
    expect(pool.getStatus().maxWorkers).toBeGreaterThanOrEqual(1);
  });

  it('parses JSON on the main thread after shutdown', async () => {
    const pool = new WorkerPool(1);
    await pool.shutdown();
    expect(pool.getStatus().available).toBe(false);

    const result = await pool.run<{ a: number }>({ type: 'parse-json', data: '{"a":42}' });
    expect(result).toEqual({ a: 42 });
  });

  it('chunks text on the main thread after shutdown', async () => {
    const pool = new WorkerPool(1);
    await pool.shutdown();

    const text = Array.from({ length: 30 }, (_, i) => `Paragraph ${i}. ` + 'word '.repeat(30)).join(
      '\n\n',
    );
    const chunks = await pool.run<ReturnType<TextChunker['chunk']>>({
      type: 'chunk-text',
      data: text,
    });
    expect(Array.isArray(chunks)).toBe(true);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => typeof c.content === 'string')).toBe(true);
  });

  it('rejects unknown task types', async () => {
    const pool = new WorkerPool(1);
    await pool.shutdown();
    // @ts-expect-error intentionally unknown task type
    await expect(pool.run({ type: 'nope', data: null })).rejects.toThrow('Unknown task type');
  });
});
