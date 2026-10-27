import { logger } from './logger';

const log = logger.child('ConcurrencyPool');

export type Task<T> = () => Promise<T>;

export interface TaskResult<T> {
  status: 'fulfilled' | 'rejected';
  value?: T;
  reason?: unknown;
  index: number;
  durationMs: number;
}

export interface ConcurrencyPoolConfig {
  /** Max concurrent tasks. Default: 5 */
  concurrency: number;
  /** Enable adaptive concurrency based on latency. Default: false */
  adaptive: boolean;
  /** Min concurrency when adaptive. Default: 2 */
  minConcurrency: number;
  /** Max concurrency when adaptive. Default: 10 */
  maxConcurrency: number;
  /** Latency threshold (ms) to increase concurrency. Default: 2000 */
  scaleUpThresholdMs: number;
  /** Latency threshold (ms) to decrease concurrency. Default: 5000 */
  scaleDownThresholdMs: number;
}

const defaultConfig: ConcurrencyPoolConfig = {
  concurrency: 5,
  adaptive: false,
  minConcurrency: 2,
  maxConcurrency: 10,
  scaleUpThresholdMs: 2000,
  scaleDownThresholdMs: 5000,
};

export type ProgressCallback = (
  completed: number,
  total: number,
  latestResult?: TaskResult<any>,
) => void;

/**
 * Concurrency Pool
 *
 * Manages parallel execution of async tasks with configurable concurrency limits.
 * Supports adaptive concurrency that auto-tunes based on response latency.
 *
 * Usage:
 *   const pool = new ConcurrencyPool({ concurrency: 5 });
 *   const results = await pool.runBatch(tasks, onProgress);
 */
export class ConcurrencyPool {
  private config: ConcurrencyPoolConfig;
  private currentConcurrency: number;
  private recentLatencies: number[] = [];

  constructor(config: Partial<ConcurrencyPoolConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
    this.currentConcurrency = this.config.concurrency;
  }

  /**
   * Run a batch of tasks with concurrency limit.
   * Returns results in the same order as input tasks.
   */
  async runBatch<T>(tasks: Task<T>[], onProgress?: ProgressCallback): Promise<TaskResult<T>[]> {
    if (tasks.length === 0) return [];

    const concurrency = this.config.adaptive ? this.currentConcurrency : this.config.concurrency;

    log.info('Starting batch execution', {
      taskCount: tasks.length,
      concurrency,
      adaptive: this.config.adaptive,
    });

    const results: TaskResult<T>[] = new Array(tasks.length);
    let completed = 0;

    // Semaphore-based concurrency control
    const executing = new Set<Promise<void>>();

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const index = i;

      const promise = this.executeTask(task, index).then((result) => {
        results[index] = result;
        completed++;

        if (this.config.adaptive) {
          this.adaptConcurrency(result.durationMs);
        }

        if (onProgress) {
          onProgress(completed, tasks.length, result);
        }
      });

      executing.add(promise);

      promise.finally(() => {
        executing.delete(promise);
      });

      // Throttle: wait if we've hit the concurrency limit
      if (
        executing.size >= (this.config.adaptive ? this.currentConcurrency : this.config.concurrency)
      ) {
        await Promise.race(executing);
      }
    }

    // Wait for all remaining tasks
    await Promise.all(executing);

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    log.info('Batch execution completed', {
      total: tasks.length,
      succeeded,
      failed,
      avgDuration: Math.round(results.reduce((a, r) => a + r.durationMs, 0) / results.length),
    });

    return results;
  }

  /**
   * Run tasks in ordered batches (each batch runs in parallel, batches run sequentially).
   * Guarantees context updates between batches.
   */
  async runOrderedBatches<T>(
    tasks: Task<T>[],
    batchSize: number,
    onBatchComplete?: (_batchIndex: number, _batchResults: TaskResult<T>[]) => void,
  ): Promise<TaskResult<T>[]> {
    const allResults: TaskResult<T>[] = [];
    const batches = this.chunkArray(tasks, batchSize);

    log.info('Starting ordered batch execution', {
      taskCount: tasks.length,
      batchSize,
      batchCount: batches.length,
    });

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const batchResults = await this.runBatch(batch);
      allResults.push(...batchResults);

      if (onBatchComplete) {
        onBatchComplete(i, batchResults);
      }

      log.info(`Batch ${i + 1}/${batches.length} completed`, {
        succeeded: batchResults.filter((r) => r.status === 'fulfilled').length,
        failed: batchResults.filter((r) => r.status === 'rejected').length,
      });
    }

    return allResults;
  }

  /**
   * Execute a single task with timing
   */
  private async executeTask<T>(task: Task<T>, index: number): Promise<TaskResult<T>> {
    const start = Date.now();
    try {
      const value = await task();
      return {
        status: 'fulfilled',
        value,
        index,
        durationMs: Date.now() - start,
      };
    } catch (reason) {
      return {
        status: 'rejected',
        reason,
        index,
        durationMs: Date.now() - start,
      };
    }
  }

  /**
   * Adapt concurrency based on recent latency trends
   */
  private adaptConcurrency(latencyMs: number): void {
    this.recentLatencies.push(latencyMs);

    // Keep only last 10 measurements
    if (this.recentLatencies.length > 10) {
      this.recentLatencies.shift();
    }

    const avgLatency =
      this.recentLatencies.reduce((a, b) => a + b, 0) / this.recentLatencies.length;

    if (
      avgLatency < this.config.scaleUpThresholdMs &&
      this.currentConcurrency < this.config.maxConcurrency
    ) {
      this.currentConcurrency++;
      log.info('Adaptive: increased concurrency', {
        concurrency: this.currentConcurrency,
        avgLatency: Math.round(avgLatency),
      });
    } else if (
      avgLatency > this.config.scaleDownThresholdMs &&
      this.currentConcurrency > this.config.minConcurrency
    ) {
      this.currentConcurrency--;
      log.info('Adaptive: decreased concurrency', {
        concurrency: this.currentConcurrency,
        avgLatency: Math.round(avgLatency),
      });
    }
  }

  /**
   * Get current concurrency level
   */
  getCurrentConcurrency(): number {
    return this.config.adaptive ? this.currentConcurrency : this.config.concurrency;
  }

  /**
   * Split array into chunks
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

/**
 * Utility: Run multiple promises with concurrency limit (simpler API)
 */
export async function runWithConcurrency<T>(
  tasks: Task<T>[],
  concurrency: number = 5,
): Promise<TaskResult<T>[]> {
  const pool = new ConcurrencyPool({ concurrency });
  return pool.runBatch(tasks);
}
