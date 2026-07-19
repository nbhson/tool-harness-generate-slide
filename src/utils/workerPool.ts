import { logger } from './logger';

const log = logger.child('WorkerPool');

export type WorkerTaskType = 'export-pptx' | 'parse-json' | 'chunk-text';

export interface WorkerTask {
  type: WorkerTaskType;
  data: any;
}

export interface WorkerTaskResponse {
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * Worker Pool for CPU-bound tasks.
 * 
 * Uses Node.js worker_threads to offload heavy tasks:
 * - PPTX generation (pptxgenjs serialize/render)
 * - Large JSON parsing
 * - Text chunking on large documents
 * 
 * Note: Node.js worker_threads are most useful for CPU-bound tasks.
 * I/O-bound tasks (LLM API calls) are better handled with async/promises.
 * 
 * Usage:
 *   const pool = new WorkerPool();
 *   const result = await pool.run({ type: 'export-pptx', data: { slides, theme } });
 *   await pool.shutdown();
 */
export class WorkerPool {
  private maxWorkers: number;
  private isAvailable: boolean;

  constructor(maxWorkers?: number) {
    this.maxWorkers = maxWorkers || Math.min(4, (require('os').cpus()?.length || 4) - 1);
    this.isAvailable = false;

    // Check if worker_threads is available
    try {
      require('worker_threads');
      this.isAvailable = true;
      log.info('Worker pool initialized', { maxWorkers: this.maxWorkers, available: true });
    } catch {
      log.warn('worker_threads not available, falling back to main thread');
      this.isAvailable = false;
    }
  }

  /**
   * Run a task through the worker pool.
   * Falls back to main thread if workers unavailable.
   */
  async run<T = any>(task: WorkerTask): Promise<T> {
    if (!this.isAvailable) {
      return this.runOnMainThread<T>(task);
    }

    try {
      const { Worker } = require('worker_threads');
      return new Promise<T>((resolve, reject) => {
        const worker = new Worker(this.getWorkerScript(), {
          workerData: task,
        });

        const timeout = setTimeout(() => {
          worker.terminate();
          reject(new Error(`Worker task timed out for type: ${task.type}`));
        }, 120_000); // 2 min timeout

        worker.on('message', (msg: WorkerTaskResponse) => {
          clearTimeout(timeout);
          if (msg.success) {
            resolve(msg.data as T);
          } else {
            reject(new Error(msg.error || 'Worker task failed'));
          }
        });

        worker.on('error', (err: Error) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
    } catch (error) {
      log.warn('Worker execution failed, falling back to main thread', { error: String(error) });
      return this.runOnMainThread<T>(task);
    }
  }

  /**
   * Run task on main thread (fallback)
   */
  private async runOnMainThread<T>(task: WorkerTask): Promise<T> {
    switch (task.type) {
      case 'export-pptx':
        return this.runPPTXExport(task.data) as T;
      case 'parse-json':
        return JSON.parse(task.data) as T;
      case 'chunk-text':
        const { TextChunker } = require('./textChunker');
        const chunker = new TextChunker();
        return chunker.chunk(task.data) as T;
      default:
        throw new Error(`Unknown task type: ${task.type}`);
    }
  }

  /**
   * Run PPTX export on main thread
   */
  private async runPPTXExport(data: any): Promise<any> {
    const { SlideExporter } = require('../harness/tools/slideExporter');
    const exporter = new SlideExporter();
    return exporter.exportPPTX(data.presentation, data.outputPath);
  }

  /**
   * Get inline worker script as a data URL
   */
  private getWorkerScript(): string {
    // Returns an inline worker script that processes tasks
    const script = `
      const { parentPort, workerData } = require('worker_threads');
      
      async function processTask(task) {
        switch (task.type) {
          case 'export-pptx': {
            const { SlideExporter } = require('../harness/tools/slideExporter');
            const exporter = new SlideExporter();
            const result = await exporter.exportPPTX(task.data.presentation, task.data.outputPath);
            return result;
          }
          case 'parse-json':
            return JSON.parse(task.data);
          case 'chunk-text': {
            const { TextChunker } = require('./textChunker');
            const chunker = new TextChunker();
            return chunker.chunk(task.data);
          }
          default:
            throw new Error('Unknown task type: ' + task.type);
        }
      }

      processTask(workerData)
        .then(data => parentPort.postMessage({ success: true, data }))
        .catch(error => parentPort.postMessage({ success: false, error: error.message }));
    `;

    // Write to a temp file and return path
    const path = require('path');
    const fs = require('fs');
    const os = require('os');
    const tmpPath = path.join(os.tmpdir(), `worker-${Date.now()}.js`);
    fs.writeFileSync(tmpPath, script);
    return tmpPath;
  }

  /**
   * Shutdown all workers
   */
  async shutdown(): Promise<void> {
    this.isAvailable = false;
    log.info('Worker pool shutdown');
  }

  /**
   * Get pool status
   */
  getStatus(): { available: boolean; maxWorkers: number } {
    return {
      available: this.isAvailable,
      maxWorkers: this.maxWorkers,
    };
  }
}