import { describe, expect, it, vi } from 'vitest';
import { ConcurrencyPool, runWithConcurrency } from '../concurrency';

describe('ConcurrencyPool', () => {
  it('should run all tasks and return ordered results', async () => {
    const pool = new ConcurrencyPool({ concurrency: 2 });
    const tasks = [async () => 'task1', async () => 'task2', async () => 'task3'];

    const results = await pool.runBatch(tasks);

    expect(results).toHaveLength(3);
    expect(results[0].status).toBe('fulfilled');
    expect(results[0].value).toBe('task1');
    expect(results[1].value).toBe('task2');
    expect(results[2].value).toBe('task3');
  });

  it('should enforce max concurrency limit', async () => {
    let activeCount = 0;
    let maxObservedActive = 0;

    const pool = new ConcurrencyPool({ concurrency: 2 });
    const tasks = Array.from({ length: 5 }, (_, i) => async () => {
      activeCount++;
      maxObservedActive = Math.max(maxObservedActive, activeCount);
      await new Promise((r) => setTimeout(r, 20));
      activeCount--;
      return i;
    });

    await pool.runBatch(tasks);

    expect(maxObservedActive).toBeLessThanOrEqual(2);
  });

  it('should handle task failures gracefully', async () => {
    const pool = new ConcurrencyPool({ concurrency: 2 });
    const tasks = [
      async () => 'success',
      async () => {
        throw new Error('fail');
      },
    ];

    const results = await pool.runBatch(tasks);

    expect(results[0].status).toBe('fulfilled');
    expect(results[0].value).toBe('success');
    expect(results[1].status).toBe('rejected');
    expect((results[1].reason as Error).message).toBe('fail');
  });

  it('should report progress via callback', async () => {
    const pool = new ConcurrencyPool({ concurrency: 2 });
    const onProgress = vi.fn();
    const tasks = [async () => 1, async () => 2];

    await pool.runBatch(tasks, onProgress);

    expect(onProgress).toHaveBeenCalledTimes(2);
  });

  it('should run ordered batches sequentially', async () => {
    const pool = new ConcurrencyPool({ concurrency: 5 });
    const batchCompletedOrder: number[] = [];

    const tasks = Array.from({ length: 4 }, (_, i) => async () => i);
    await pool.runOrderedBatches(tasks, 2, (batchIndex) => {
      batchCompletedOrder.push(batchIndex);
    });

    expect(batchCompletedOrder).toEqual([0, 1]);
  });

  it('should run helper runWithConcurrency correctly', async () => {
    const tasks = [async () => 'a', async () => 'b'];
    const results = await runWithConcurrency(tasks, 2);

    expect(results.map((r) => r.value)).toEqual(['a', 'b']);
  });
});
