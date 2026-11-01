import { describe, expect, it } from 'vitest';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

const execFileAsync = promisify(execFile);

/**
 * Integration test cho worker thread path (WorkerPool → new Worker eval script).
 *
 * Worker script dùng require() với đường dẫn tuyệt đối tới code đã compile,
 * nên test này chỉ chạy khi đã có dist/ (tức là sau `npm run build`).
 * Nếu chưa build (CI lần đầu, fresh clone) → skip, không fail.
 *
 * Cách chạy đầy đủ: `npm run build && npm test`
 */
const distPool = resolve(process.cwd(), 'dist/utils/workerPool.js');
const hasDist = existsSync(distPool);

/** Script chạy trong process con với `node` thuần (không qua tsx/vitest). */
const CHILD_SCRIPT = `
const { WorkerPool } = require(${JSON.stringify(distPool)});
const { existsSync } = require('fs');
const os = require('os');
const path = require('path');

(async () => {
  const pool = new WorkerPool(1);

  // 1) chunk-text qua worker thread
  const text = Array.from({ length: 20 }, (_, i) => '## Phần ' + i + '\\n' + 'nội dung chi tiết. '.repeat(200)).join('\\n\\n');
  const chunks = await pool.run({ type: 'chunk-text', data: text });
  if (!Array.isArray(chunks) || chunks.length < 2) throw new Error('chunk-text: expected multiple chunks, got ' + (chunks && chunks.length));

  // 2) parse-json qua worker thread
  const parsed = await pool.run({ type: 'parse-json', data: JSON.stringify({ ok: 42 }) });
  if (!parsed || parsed.ok !== 42) throw new Error('parse-json failed');

  // 3) export-pptx qua worker thread (pptxgenjs chạy trong worker)
  const theme = require(${JSON.stringify(resolve(process.cwd(), 'dist/templates/modern.json'))});
  const presentation = {
    id: 'worker-smoke',
    title: 'Worker Integration Test',
    slides: [
      {
        id: 'slide-0',
        index: 0,
        content: {
          title: 'Slide thử nghiệm worker',
          subtitle: 'Sinh từ worker thread',
          bullets: ['**Điểm 1**: worker export hoạt động', '**Điểm 2**: pptxgenjs trong thread'],
          layout: 'title-bullets',
        },
        isValid: true,
        validationErrors: [],
      },
    ],
    theme,
    metadata: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      language: 'vi',
      aspectRatio: '16:9',
      totalSlides: 1,
      topic: 'Worker Integration Test',
    },
    isValid: true,
    validationErrors: [],
  };
  const outPath = path.join(os.tmpdir(), 'worker-integration-' + Date.now() + '.pptx');
  const finalPath = await pool.run({ type: 'export-pptx', data: { presentation, outputPath: outPath } });
  if (!existsSync(finalPath)) throw new Error('export-pptx: file not created at ' + finalPath);

  await pool.shutdown();
  console.log('WORKER_INTEGRATION_OK');
  process.exit(0);
})().catch((err) => {
  console.error('WORKER_INTEGRATION_FAIL:', err && err.message ? err.message : err);
  process.exit(1);
});
`;

describe.skipIf(!hasDist)('Worker thread integration (worker path thật, qua dist)', () => {
  it(
    'worker pool xử lý chunk-text, parse-json và export-pptx trong worker thread',
    async () => {
      const { stdout } = await execFileAsync(process.execPath, ['-e', CHILD_SCRIPT], {
        cwd: process.cwd(),
        timeout: 60_000,
      });
      expect(stdout).toContain('WORKER_INTEGRATION_OK');
    },
    70_000,
  );

  it('dist đã build và khớp với src hiện tại (smoke import)', async () => {
    expect(hasDist).toBe(true);
    // Import trực tiếp dist pool để đảm bảo module compile được bằng node thuần.
    // Dùng dynamic import với path động (không type-import vào dist) để tsc
    // không coi file trong dist/ là input file (tránh lỗi TS5055 khi build).
    const mod = (await import(distPool)) as {
      WorkerPool: new (n?: number) => {
        run<T>(task: { type: string; data: unknown }): Promise<T>;
        getStatus(): { available: boolean; maxWorkers: number };
        shutdown(): Promise<void>;
      };
    };
    const pool = new mod.WorkerPool(1);
    expect(pool.getStatus().available).toBe(true);
    const parsed = await pool.run<{ ok: boolean }>({
      type: 'parse-json',
      data: '{"ok":true}',
    });
    expect(parsed).toEqual({ ok: true });
    await pool.shutdown();
  });
});
