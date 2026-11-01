import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EvaluatorAgent } from '../evaluatorAgent';
import { makePresentation } from '../../__tests__/fixtures';

describe('EvaluatorAgent', () => {
  const mockDeckGuardrails = {
    validate: vi.fn(),
  } as any;

  const mockSlideGuardrails = {
    validateSlides: vi.fn(),
  } as any;

  const mockFeedbackLoop = {
    onValidationFailure: vi.fn(),
  } as any;

  const evaluator = new EvaluatorAgent(mockDeckGuardrails, mockSlideGuardrails, mockFeedbackLoop);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('approve khi tất cả slide và deck đều pass', async () => {
    mockSlideGuardrails.validateSlides.mockResolvedValue({
      allPassed: true,
      results: [{ passed: true, errors: [] }, { passed: true, errors: [] }],
    });
    mockDeckGuardrails.validate.mockResolvedValue({ passed: true, errors: [], warnings: [] });

    const result = await evaluator.evaluate(makePresentation());

    expect(result.approved).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.feedback).toEqual([]);
  });

  it('gom lỗi slide về dạng "Slide N: <error>"', async () => {
    mockSlideGuardrails.validateSlides.mockResolvedValue({
      allPassed: false,
      results: [
        { passed: true, errors: [] },
        { passed: false, errors: ['Too many bullet points'] },
        { passed: false, errors: ['Title too short', 'Empty subtitle'] },
      ],
    });
    mockDeckGuardrails.validate.mockResolvedValue({ passed: true, errors: [], warnings: [] });

    const result = await evaluator.evaluate(makePresentation());

    expect(result.approved).toBe(false);
    expect(result.errors).toEqual([
      'Slide 2: Too many bullet points',
      'Slide 3: Title too short',
      'Slide 3: Empty subtitle',
    ]);
  });

  it('gom lỗi deck level vào errors', async () => {
    mockSlideGuardrails.validateSlides.mockResolvedValue({
      allPassed: true,
      results: [],
    });
    mockDeckGuardrails.validate.mockResolvedValue({
      passed: false,
      errors: ['Deck exceeds max slides'],
      warnings: [],
    });

    const result = await evaluator.evaluate(makePresentation());

    expect(result.approved).toBe(false);
    expect(result.errors).toContain('Deck exceeds max slides');
  });

  it('chuyển deck warnings vào feedback (không chặn approval)', async () => {
    mockSlideGuardrails.validateSlides.mockResolvedValue({
      allPassed: true,
      results: [],
    });
    mockDeckGuardrails.validate.mockResolvedValue({
      passed: true,
      errors: [],
      warnings: ['Inconsistent fonts detected'],
    });

    const result = await evaluator.evaluate(makePresentation());

    expect(result.approved).toBe(true);
    expect(result.feedback).toEqual(['Inconsistent fonts detected']);
  });

  it('kết hợp cả slide errors lẫn deck errors', async () => {
    mockSlideGuardrails.validateSlides.mockResolvedValue({
      allPassed: false,
      results: [{ passed: false, errors: ['Missing title'] }],
    });
    mockDeckGuardrails.validate.mockResolvedValue({
      passed: false,
      errors: ['Deck not coherent'],
      warnings: [],
    });

    const result = await evaluator.evaluate(makePresentation());

    expect(result.approved).toBe(false);
    expect(result.errors).toEqual(['Slide 1: Missing title', 'Deck not coherent']);
  });

  it('nhận custom maxRetries qua constructor (mặc định 3)', () => {
    const withRetries = new EvaluatorAgent(mockDeckGuardrails, mockSlideGuardrails, mockFeedbackLoop, 5);
    expect(withRetries).toBeInstanceOf(EvaluatorAgent);
  });

  it('nhận tham số attempt (dùng cho log/trace)', async () => {
    mockSlideGuardrails.validateSlides.mockResolvedValue({
      allPassed: true,
      results: [],
    });
    mockDeckGuardrails.validate.mockResolvedValue({ passed: true, errors: [], warnings: [] });

    const result = await evaluator.evaluate(makePresentation(), 2);

    expect(result.approved).toBe(true);
    expect(mockSlideGuardrails.validateSlides).toHaveBeenCalledWith(
      makePresentation().slides.map((s) => expect.objectContaining({ id: s.id })),
    );
  });
});
