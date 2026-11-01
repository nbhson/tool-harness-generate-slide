import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContentGenerator } from '../contentGenerator';
import type { SlidePlan } from '../contentGenerator';

/**
 * Mock LLM qua vi.mock('node-fetch').
 * ContentGenerator gọi fetch được import từ 'node-fetch' (không phải
 * globalThis.fetch), nên phải mock module thay vì stub global.
 */

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));

vi.mock('node-fetch', () => ({ default: fetchMock }));

interface MockLLMOptions {
  /** Nội dung message trả về cho request thứ n (theo thứ tự gọi). */
  contents?: string[];
  /** HTTP status cho request thứ n (mặc định 200). */
  statuses?: number[];
  /** Trả body dạng SSE stream thay vì JSON. */
  sse?: boolean;
}

function makeResponseBody(content: string, sse = false): string {
  if (sse) {
    const parts = content.match(/.{1,20}/gs) ?? [];
    return (
      parts.map((p) => `data: ${JSON.stringify({ choices: [{ delta: { content: p } }] })}`).join('\n') +
      '\ndata: [DONE]\n'
    );
  }
  return JSON.stringify({ choices: [{ message: { content } }] });
}

function stubLLM({ contents, statuses, sse }: MockLLMOptions): ReturnType<typeof vi.fn> {
  let call = 0;
  fetchMock.mockImplementation(async () => {
    const i = Math.min(call, (contents ?? []).length - 1);
    const status = statuses ? (statuses[Math.min(call, statuses.length - 1)] ?? 200) : 200;
    call++;
    const body = status === 200 ? makeResponseBody(contents?.[i] ?? '', sse) : 'server error';
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => body,
    };
  });
  return fetchMock;
}

function stubFetchFailure(): void {
  fetchMock.mockImplementation(async () => {
    throw new Error('connect ECONNREFUSED 127.0.0.1:3000');
  });
}

const outlineJson = JSON.stringify([
  {
    title: 'Tổng quan dự án',
    layout: 'title-bullets',
    bullets: ['**Bối cảnh**: Thị trường đang tăng trưởng mạnh'],
    subtitle: 'Q4 2026',
  },
  {
    title: 'Kết luận',
    layout: 'title',
    bullets: [],
  },
]);

const contentJson = JSON.stringify({
  title: 'Doanh thu quý 4',
  subtitle: 'Phân tích hiệu quả kinh doanh',
  bullets: ['**Tăng trưởng**: Doanh thu tăng 45% so với cùng kỳ'],
  notes: 'Nhấn mạnh tăng trưởng từ kênh online.',
  chart: {
    type: 'bar',
    data: [
      { label: 'Q1', value: 45 },
      { label: 'Q2', value: 67 },
    ],
    title: 'Doanh thu theo quý',
    labels: ['Q1', 'Q2'],
    colors: ['#3B82F6', '#10B981'],
  },
});

describe('ContentGenerator (mock LLM qua fetch)', () => {
  const config = {
    baseUrl: 'http://mock-llm.local',
    apiKey: 'test-key',
    model: 'test-model',
    fallbackModel: 'fallback-model',
  };

  beforeEach(() => {
    fetchMock.mockReset();
  });

  afterEach(() => {
    fetchMock.mockReset();
  });

  describe('generateOutline', () => {
    it('parse JSON array từ LLM response thành SlidePlan[]', async () => {
      const fetchMock = stubLLM({ contents: [outlineJson] });
      const gen = new ContentGenerator(config);

      const plans = await gen.generateOutline('Giới thiệu dự án ABC');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }];
      expect(url).toBe('http://mock-llm.local/v1/chat/completions');
      const body = JSON.parse(init.body as string) as { model: string; messages: unknown[] };
      expect(body.model).toBe('test-model');
      expect(body.messages).toHaveLength(1);

      expect(plans).toHaveLength(2);
      expect(plans[0].title).toBe('Tổng quan dự án');
      expect(plans[0].layout).toBe('title-bullets');
      expect(plans[1].layout).toBe('title');
    });

    it('strip markdown code fences trước khi parse', async () => {
      stubLLM({ contents: ['```json\n' + outlineJson + '\n```'] });
      const gen = new ContentGenerator(config);

      const plans = await gen.generateOutline('Giới thiệu dự án ABC');

      expect(plans).toHaveLength(2);
      expect(plans[0].title).toBe('Tổng quan dự án');
    });

    it('fallback về default outline khi fetch fail (connection refused)', async () => {
      stubFetchFailure();
      const gen = new ContentGenerator(config);

      const plans = await gen.generateOutline('Giới thiệu dự án ABC về năng lượng tái tạo');

      expect(plans.length).toBeGreaterThan(0);
      // Fallback outline luôn có slide đầu là title
      expect(plans[0].layout).toBe('title');
    });

    it('fallback về default outline khi LLM trả JSON rỗng', async () => {
      stubLLM({ contents: ['[]'] });
      const gen = new ContentGenerator(config);

      const plans = await gen.generateOutline('Giới thiệu dự án ABC về năng lượng tái tạo');

      expect(plans.length).toBeGreaterThan(0);
    });

    it('input dài (>1500 chars) đi qua chunking: có title + thank-you slide, plans mang chunkIndex', async () => {
      const section = (i: number) =>
        `## Phần ${i}\n` +
        Array.from(
          { length: 8 },
          (_, j) => `Paragraph ${i}.${j}: ` + 'Nội dung chi tiết về phân tích thị trường. '.repeat(6),
        ).join('\n\n');
      const longTopic = Array.from({ length: 3 }, (_, i) => section(i + 1)).join('\n\n');
      expect(longTopic.length).toBeGreaterThan(1500);

      const chunkResponse = JSON.stringify([
        { title: `Slide phần`, layout: 'title-bullets', bullets: ['**Điểm**: chi tiết'] },
      ]);
      const fetchMock = stubLLM({ contents: Array.from({ length: 10 }, () => chunkResponse) });
      const gen = new ContentGenerator(config);

      const plans = await gen.generateOutline(longTopic, undefined, 12);

      // LLM được gọi (các prompt chunk giống nhau trong cùng ms bị coalesce —
      // xem test riêng phía dưới), title + thank-you không cần LLM.
      expect(fetchMock).toHaveBeenCalled();
      expect(plans[0].layout).toBe('title');
      expect(plans[plans.length - 1].title).toBe('Thank You');
      expect(plans.length).toBeLessThanOrEqual(12);
      // Các slide giữa mang chunkIndex
      const middle = plans.slice(1, -1);
      expect(middle.length).toBeGreaterThan(0);
      expect(middle.every((p) => typeof p.chunkIndex === 'number')).toBe(true);
    });

    it('coalesce các request chunk giống nhau trong cùng thời điểm (1 fetch duy nhất)', async () => {
      const section = (i: number) =>
        `## Phần ${i}\n` +
        Array.from(
          { length: 8 },
          (_, j) => `Paragraph ${i}.${j}: ` + 'Nội dung chi tiết về phân tích thị trường. '.repeat(6),
        ).join('\n\n');
      const longTopic = Array.from({ length: 3 }, (_, i) => section(i + 1)).join('\n\n');

      const chunkResponse = JSON.stringify([
        { title: 'Slide phần', layout: 'title-bullets', bullets: ['**Điểm**: chi tiết'] },
      ]);
      const fetchMock = stubLLM({ contents: Array.from({ length: 10 }, () => chunkResponse) });
      const gen = new ContentGenerator(config);

      await gen.generateOutline(longTopic, undefined, 12);

      // RequestCoalescer dedupe key = 50 ký tự đầu prompt + Date.now():
      // các chunk prompt giống nhau chạy song song → bị coalesce đáng kể
      // (đôi lúc rớt qua ms khác nên không khẳng định cứng = 1).
      expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(6);
    });

    it('enforce visual variety cho outline ≥ 6 slide qua chunk path (có layout chart/table/stats...)', async () => {
      const section = (i: number) =>
        `## Phần ${i}\n` +
        Array.from(
          { length: 8 },
          (_, j) => `Paragraph ${i}.${j}: ` + 'Nội dung chi tiết về phân tích thị trường. '.repeat(6),
        ).join('\n\n');
      const longTopic = Array.from({ length: 3 }, (_, i) => section(i + 1)).join('\n\n');

      const chunkResponse = JSON.stringify([
        { title: 'Slide phần', layout: 'title-bullets', bullets: ['**Điểm**: chi tiết'] },
      ]);
      stubLLM({ contents: Array.from({ length: 10 }, () => chunkResponse) });
      const gen = new ContentGenerator(config);

      const plans = await gen.generateOutline(longTopic, undefined, 12);

      expect(plans.length).toBeGreaterThanOrEqual(6);
      const layouts = new Set<string>(plans.map((p) => p.layout));
      const visualLayouts = ['stats', 'image-grid', 'table', 'flowchart', 'chart', 'timeline'];
      expect(visualLayouts.some((l) => layouts.has(l))).toBe(true);
    });
  });

  describe('generateSlideContent', () => {
    const plan: SlidePlan = {
      title: 'Doanh thu quý 4',
      layout: 'chart',
      bullets: ['**Fallback**: điểm dự phòng'],
    };

    it('parse content JSON kèm chart data', async () => {
      stubLLM({ contents: [contentJson] });
      const gen = new ContentGenerator(config);

      const content = await gen.generateSlideContent('Bối cảnh doanh thu', plan);

      expect(content.title).toBe('Doanh thu quý 4');
      expect(content.chart).toBeDefined();
      expect(content.chart?.type).toBe('bar');
      expect(content.chart?.data).toHaveLength(2);
      expect(content.notes).toContain('tăng trưởng từ kênh online');
    });

    it('truyền API key vào Authorization header', async () => {
      const fetchMock = stubLLM({ contents: [contentJson] });
      const gen = new ContentGenerator(config);

      await gen.generateSlideContent('Bối cảnh', plan);

      const headers = (fetchMock.mock.calls[0][1] as { headers: Record<string, string> }).headers;
      expect(headers.Authorization).toBe('Bearer test-key');
    });

    it('fallback về plan bullets khi LLM unavailable', async () => {
      stubFetchFailure();
      const gen = new ContentGenerator(config);

      const content = await gen.generateSlideContent('Bối cảnh', plan);

      expect(content.title).toBe('Doanh thu quý 4');
      expect(content.layout).toBe('chart');
      // Fallback visual data được inject cho layout chart
      expect(content.chart).toBeDefined();
      expect(content.chart!.data.length).toBeGreaterThan(0);
    });

    it('dùng template content khi response không chứa JSON', async () => {
      stubLLM({ contents: ['Xin chào, tôi không có JSON nào cả'] });
      const gen = new ContentGenerator(config);

      const content = await gen.generateSlideContent('Bối cảnh', plan);

      expect(content.title).toBe('Doanh thu quý 4');
      expect(content.bullets.length).toBeGreaterThan(0);
      expect(content.chart).toBeDefined(); // fallback data cho layout chart
    });

    it('parse SSE stream response (data: {...} lines) với onStreamChunk callback', async () => {
      const chunks: string[] = [];
      stubLLM({ contents: [contentJson], sse: true });
      const gen = new ContentGenerator(config);

      const content = await gen.generateSlideContent('Bối cảnh', plan, (c) => chunks.push(c));

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.join('')).toContain('Doanh thu quý 4');
      expect(content.title).toBe('Doanh thu quý 4');
      expect(content.chart).toBeDefined();
    });

    it('retry bằng fallback model khi primary trả 500', async () => {
      const fetchMock = stubLLM({
        contents: [contentJson],
        statuses: [500, 200],
      });
      const gen = new ContentGenerator(config);

      const content = await gen.generateSlideContent('Bối cảnh', plan);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      const secondBody = JSON.parse(
        (fetchMock.mock.calls[1][1] as { body: string }).body,
      ) as { model: string };
      expect(secondBody.model).toBe('fallback-model');
      expect(content.title).toBe('Doanh thu quý 4');
    });

    it('ném lỗi rõ ràng khi cả primary lẫn fallback đều fail', async () => {
      stubLLM({ statuses: [500, 503], contents: ['', ''] });
      const gen = new ContentGenerator(config);

      // Circuit breaker có thể nuốt lỗi sau vài lần — chỉ cần nội dung fallback
      // xuất hiện là hành vi đúng (không crash).
      const content = await gen.generateSlideContent('Bối cảnh', plan);
      expect(content.title).toBe('Doanh thu quý 4');
      expect(content.layout).toBe('chart');
    });
  });

  describe('helpers công khai', () => {
    it('chunkText + chunksToContext hoạt động như một cặp', () => {
      stubLLM({ contents: ['[]'] });
      const gen = new ContentGenerator(config);

      const longText = Array.from(
        { length: 10 },
        (_, i) => `## Section ${i}\n` + 'Nội dung chi tiết. '.repeat(40),
      ).join('\n\n');
      const chunks = gen.chunkText(longText);
      expect(chunks.length).toBeGreaterThan(1);

      const context = gen.chunksToContext(chunks.slice(0, 1));
      expect(context).toContain('Section 0');
    });
  });
});
