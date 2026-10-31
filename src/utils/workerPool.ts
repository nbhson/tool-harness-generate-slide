import { logger } from './logger';
import os from 'os';
import { Worker } from 'worker_threads';
import { TextChunker } from './textChunker';
import type { Presentation } from '../schemas/presentation.schema';

const log = logger.child('WorkerPool');

export type WorkerTaskType = 'export-pptx' | 'parse-json' | 'chunk-text';

/** Payload for the 'export-pptx' worker task. */
export interface PptxExportTaskData {
  presentation: Presentation;
  outputPath: string;
}

export interface WorkerTask {
  type: WorkerTaskType;
  data: unknown;
}

export interface WorkerTaskResponse {
  success: boolean;
  data?: unknown;
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
    this.maxWorkers = maxWorkers || Math.min(4, (os.cpus()?.length || 4) - 1);
    this.isAvailable = true;
    log.info('Worker pool initialized', { maxWorkers: this.maxWorkers, available: true });
  }

  /**
   * Run a task through the worker pool.
   * Falls back to main thread if workers unavailable.
   */
  async run<T = unknown>(task: WorkerTask): Promise<T> {
    if (!this.isAvailable) {
      return this.runOnMainThread<T>(task);
    }

    try {
      return new Promise<T>((resolve, reject) => {
        const worker = new Worker(this.getWorkerScript(), {
          eval: true,
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
        return (await this.runPPTXExport(task.data)) as T;
      case 'parse-json':
        return JSON.parse(task.data as string) as T;
      case 'chunk-text': {
        const chunker = new TextChunker();
        return chunker.chunk(task.data as string) as T;
      }
      default:
        throw new Error(`Unknown task type: ${task.type}`);
    }
  }

  /**
   * Run PPTX export on main thread
   */
  private async runPPTXExport(data: unknown): Promise<string> {
    // Lazy import to avoid loading pptxgenjs unless an export is actually needed
    const { SlideExporter } = await import('../harness/tools/slideExporter');
    const exporter = new SlideExporter();
    const { presentation, outputPath } = data as PptxExportTaskData;
    return exporter.exportPPTX(presentation, outputPath);
  }

  /**
   * Build the worker script executed with `new Worker(code, { eval: true })`.
   * Requires are resolved from this module's directory so the script works
   * both from src (tsx) and from the compiled dist/ output.
   */
  private getWorkerScript(): string {
    const srcDir = __dirname;
    return `
      const { parentPort, workerData } = require('worker_threads');
      const path = require('path');
      const srcDir = ${JSON.stringify(srcDir)};

      async function processTask(task) {
        switch (task.type) {
          case 'export-pptx': {
            const { SlideExporter } = require(path.join(srcDir, '../harness/tools/slideExporter'));
            const exporter = new SlideExporter();
            return exporter.exportPPTX(task.data.presentation, task.data.outputPath);
          }
          case 'parse-json':
            return JSON.parse(task.data);
          case 'chunk-text': {
            const { TextChunker } = require(path.join(srcDir, './textChunker'));
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
