import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { SlideHarness } from '../harness';
import { DeckGuardrails } from '../harness/guardrails/deckGuardrails';
import { DesignerAgent } from '../agents/designerAgent';

/**
 * Integration test cho SlideHarness (harness/index.ts) với LLM giả lập:
 * mock module node-fetch để giả lập OpenAI-compatible API, chạy toàn bộ
 * pipeline plan → design → evaluate → export mà không cần LLM thật.
 */

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));

vi.mock('node-fetch', () => ({ default: fetchMock }));

const outlineResponse = JSON.stringify([
  { title: 'Trang bìa', layout: 'title', bullets: [], subtitle: 'Tổng quan dự án' },
  { title: 'Bối cảnh thị trường', layout: 'title-bullets', bullets: ['**Thị trường**: Tăng trưởng 2 con số'] },
  { title: 'Kết luận', layout: 'title', bullets: [], subtitle: 'Cảm ơn' },
]);

const contentResponse = JSON.stringify({
  title: 'Nội dung slide',
  subtitle: 'Phân tích chi tiết',
  bullets: ['**Điểm chính**: Giải thích đầy đủ về nội dung slide này'],
  notes: 'Ghi chú cho người thuyết trình.',
});

function stubLLMPipeline(): void {
  fetchMock.mockImplementation(async (_url: unknown, init?: { body?: string }) => {
    const body = JSON.parse((init?.body as string) ?? '{}') as {
      messages: Array<{ content: string }>;
    };
    const prompt = body.messages[0].content;
    const isOutline = prompt.includes('presentation outline');
    const content = isOutline ? outlineResponse : contentResponse;
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ choices: [{ message: { content } }] }),
    };
  });
}

describe('SlideHarness (integration với mock LLM)', () => {
  let tempDir: string;

  beforeEach(() => {
    fetchMock.mockReset();
    tempDir = mkdtempSync(join(tmpdir(), 'harness-test-'));
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.restoreAllMocks();
    rmSync(tempDir, { recursive: true, force: true });
  });

  function makeHarness(): SlideHarness {
    return new SlideHarness({
      baseUrl: 'http://mock-llm.local',
      apiKey: 'test-key',
      model: { content: 'test-model', image: 'img-model', fallback: 'fallback-model' },
      theme: 'modern',
      guardrails: { maxSlides: 10, brandCompliance: true },
    });
  }

  it('generate() chạy full pipeline: plan → design → evaluate, trả presentation hợp lệ', async () => {
    stubLLMPipeline();
    const harness = makeHarness();

    const presentation = await harness.generate({
      topic: 'Chiến lược mở rộng thị trường Đông Nam Á',
      language: 'vi',
      maxSlides: 5,
      theme: 'modern',
    });

    expect(presentation.slides.length).toBeGreaterThan(0);
    expect(presentation.metadata.topic).toBe('Chiến lược mở rộng thị trường Đông Nam Á');
    expect(presentation.metadata.language).toBe('vi');
    expect(presentation.metadata.totalSlides).toBe(presentation.slides.length);
    expect(presentation.theme.name).toBe('modern');
    expect(presentation.isValid).toBe(true);
    // Ít nhất 1 call outline + các call content cho từng slide
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('generate() ném lỗi rõ ràng khi input bị input guardrails từ chối', async () => {
    stubLLMPipeline();
    const harness = makeHarness();

    await expect(harness.generate({ topic: 'ab' })).rejects.toThrow('Planning failed');
  });

  it('export() ghi file PPTX ra đĩa', async () => {
    stubLLMPipeline();
    const harness = makeHarness();
    const presentation = await harness.generate({
      topic: 'Báo cáo quý 4 năm 2026',
      maxSlides: 5,
    });

    const outPath = join(tempDir, 'report.pptx');
    const finalPath = await harness.export(presentation, outPath);

    expect(existsSync(finalPath)).toBe(true);
  });

  it('generateAndExport() trả presentation + đường dẫn file đã ghi', async () => {
    stubLLMPipeline();
    const harness = makeHarness();
    const outPath = join(tempDir, 'pipeline.pptx');

    const { presentation, exportPath } = await harness.generateAndExport(
      { topic: 'Onboarding nhân viên mới', maxSlides: 5 },
      outPath,
    );

    expect(presentation.slides.length).toBeGreaterThan(0);
    expect(exportPath).toBe(outPath);
    expect(existsSync(exportPath)).toBe(true);
  });

  it('smart retry: chỉ redesign slide fail (redesignSlides), sau đó approved', async () => {
    stubLLMPipeline();
    const deckSpy = vi
      .spyOn(DeckGuardrails.prototype, 'validate')
      .mockResolvedValueOnce({
        passed: false,
        errors: ['Slide 2: Too many bullet points'],
        warnings: [],
      })
      .mockResolvedValue({ passed: true, errors: [], warnings: [] });
    const redesignSpy = vi.spyOn(DesignerAgent.prototype, 'redesignSlides');

    const harness = makeHarness();
    const presentation = await harness.generate({
      topic: 'Kế hoạch sản phẩm năm 2027',
      maxSlides: 5,
    });

    expect(deckSpy).toHaveBeenCalledTimes(2);
    expect(redesignSpy).toHaveBeenCalledTimes(1);
    expect(redesignSpy.mock.calls[0][1]).toEqual([1]); // chỉ slide index 1 bị fail
    expect(presentation.isValid).toBe(true);
    expect(presentation.validationErrors).toEqual([]);
  });

  it('rate() + getMetrics() + getHistory() ghi nhận sau khi generate', async () => {
    stubLLMPipeline();
    const harness = makeHarness();
    const presentation = await harness.generate({
      topic: 'Tổng kết tài chính quý 3',
      maxSlides: 5,
    });

    await harness.rate(presentation, 5, 'Rất ổn');

    const metrics = harness.getMetrics();
    expect(metrics.successRate).toBe(1);

    const history = harness.getHistory();
    expect(history.length).toBe(1);
    expect(history[0].rating).toBe(5);
    expect(history[0].feedback).toBe('Rất ổn');
    expect(history[0].topic).toBe('Tổng kết tài chính quý 3');
  });
});
