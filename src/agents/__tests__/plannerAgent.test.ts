import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlannerAgent } from '../plannerAgent';
import type { SlidePlan } from '../../harness/tools/contentGenerator';
import type { InputGuardrailResult } from '../../harness/guardrails/inputGuardrails';

describe('PlannerAgent', () => {
  const mockContentGenerator = {
    generateOutline: vi.fn(),
  } as any;

  const mockContextManager = {} as any;

  const mockInputGuardrails = {
    validate: vi.fn(),
  } as any;

  const mockWorkingMemory = {
    setCurrentSlideIndex: vi.fn(),
  } as any;

  const planner = new PlannerAgent(
    mockContentGenerator,
    mockContextManager,
    mockInputGuardrails,
    mockWorkingMemory,
  );

  const passed: InputGuardrailResult = { passed: true, errors: [], warnings: [] };

  const samplePlans: SlidePlan[] = [
    { title: 'Introduction', layout: 'title', bullets: [] },
    { title: 'Details', layout: 'title-bullets', bullets: ['**Point**: detail'] },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockInputGuardrails.validate.mockResolvedValue(passed);
  });

  it('trả về success với outline khi input hợp lệ', async () => {
    mockContentGenerator.generateOutline.mockResolvedValue(samplePlans);

    const result = await planner.plan({ topic: 'Vietnamese street food culture' });

    expect(result.success).toBe(true);
    expect(result.slides).toEqual(samplePlans);
    expect(result.errors).toEqual([]);
    expect(mockContentGenerator.generateOutline).toHaveBeenCalledWith(
      'Vietnamese street food culture',
      undefined,
      undefined,
    );
  });

  it('truyền outline và maxSlides vào ContentGenerator', async () => {
    mockContentGenerator.generateOutline.mockResolvedValue(samplePlans);
    const outline = ['Intro', 'Body', 'Conclusion'];

    await planner.plan({ topic: 'Cloud migration strategy', outline, maxSlides: 10 });

    expect(mockContentGenerator.generateOutline).toHaveBeenCalledWith(
      'Cloud migration strategy',
      outline,
      10,
    );
  });

  it('set working memory slide index = 0 sau khi plan thành công', async () => {
    mockContentGenerator.generateOutline.mockResolvedValue(samplePlans);

    await planner.plan({ topic: 'Design systems at scale' });

    expect(mockWorkingMemory.setCurrentSlideIndex).toHaveBeenCalledWith(0);
  });

  it('trả về failure với guardrail errors khi input bị từ chối', async () => {
    mockInputGuardrails.validate.mockResolvedValue({
      passed: false,
      errors: ['Input is too short. Minimum 5 characters required (got 2)'],
      warnings: [],
    });

    const result = await planner.plan({ topic: 'ab' });

    expect(result.success).toBe(false);
    expect(result.slides).toEqual([]);
    expect(result.errors).toContain('Input is too short. Minimum 5 characters required (got 2)');
    expect(mockContentGenerator.generateOutline).not.toHaveBeenCalled();
    expect(mockWorkingMemory.setCurrentSlideIndex).not.toHaveBeenCalled();
  });

  it('trả về failure khi outline rỗng', async () => {
    mockContentGenerator.generateOutline.mockResolvedValue([]);

    const result = await planner.plan({ topic: 'Valid topic here' });

    expect(result.success).toBe(false);
    expect(result.slides).toEqual([]);
    expect(result.errors).toEqual(['Failed to generate outline from LLM']);
  });

  it('bóng lỗi từ ContentGenerator được đẩy lên caller', async () => {
    mockContentGenerator.generateOutline.mockRejectedValue(new Error('LLM exploded'));

    await expect(planner.plan({ topic: 'Valid topic here' })).rejects.toThrow('LLM exploded');
  });
});
