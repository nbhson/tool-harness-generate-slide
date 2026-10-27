import { describe, expect, it, vi } from 'vitest';
import { DesignerAgent } from '../designerAgent';
import type { SlidePlan } from '../../harness/tools/contentGenerator';
import type { Slide } from '../../schemas/slide.schema';

describe('DesignerAgent', () => {
  const mockContentGenerator = {
    generateSlideContent: vi.fn().mockImplementation(async (_, plan: SlidePlan) => ({
      title: plan.title,
      subtitle: plan.subtitle || '',
      bullets: plan.bullets,
      notes: plan.notes || '',
      layout: plan.layout,
    })),
  } as any;

  const mockContextManager = {
    buildDesignerContext: vi.fn().mockReturnValue('mock context'),
    addSlideSummary: vi.fn(),
  } as any;

  const mockSlideGuardrails = {
    validateSlide: vi.fn().mockResolvedValue({ passed: true, errors: [], warnings: [] }),
  } as any;

  const mockWorkingMemory = {
    getContextWindow: vi.fn().mockReturnValue([]),
    setCurrentSlideIndex: vi.fn(),
  } as any;

  it('should design slides using batch-parallel execution', async () => {
    const designer = new DesignerAgent(
      mockContentGenerator,
      mockContextManager,
      mockSlideGuardrails,
      mockWorkingMemory,
      { batchSize: 2 },
    );

    const plans: SlidePlan[] = [
      { title: 'Slide 1', layout: 'title', bullets: ['b1'] },
      { title: 'Slide 2', layout: 'title-bullets', bullets: ['b2'] },
      { title: 'Slide 3', layout: 'title-bullets', bullets: ['b3'] },
    ];

    const result = await designer.designSlides(plans);

    expect(result.success).toBe(true);
    expect(result.slides).toHaveLength(3);
    expect(result.slides[0].content.title).toBe('Slide 1');
    expect(result.slides[1].content.title).toBe('Slide 2');
    expect(result.slides[2].content.title).toBe('Slide 3');
  });

  it('should redesign failed slides only during smart retry', async () => {
    const designer = new DesignerAgent(
      mockContentGenerator,
      mockContextManager,
      mockSlideGuardrails,
      mockWorkingMemory,
      { batchSize: 2 },
    );

    const plans: SlidePlan[] = [
      { title: 'Slide 1', layout: 'title', bullets: ['b1'] },
      { title: 'Slide 2 (Failed)', layout: 'title-bullets', bullets: ['b2'] },
      { title: 'Slide 3', layout: 'title-bullets', bullets: ['b3'] },
    ];

    const existingSlides: Slide[] = [
      {
        id: '1',
        index: 0,
        content: { title: 'Slide 1', bullets: ['b1'], layout: 'title' },
        isValid: true,
        validationErrors: [],
      },
      {
        id: '2',
        index: 1,
        content: { title: 'Old Failed', bullets: [], layout: 'title-bullets' },
        isValid: false,
        validationErrors: ['err'],
      },
      {
        id: '3',
        index: 2,
        content: { title: 'Slide 3', bullets: ['b3'], layout: 'title-bullets' },
        isValid: true,
        validationErrors: [],
      },
    ];

    mockContentGenerator.generateSlideContent.mockClear();

    const redesignResult = await designer.redesignSlides(plans, [1], existingSlides, [
      'Fix layout',
    ]);

    expect(redesignResult.slides[0].content.title).toBe('Slide 1'); // Kept intact
    expect(redesignResult.slides[1].content.title).toBe('Slide 2 (Failed)'); // Redesigned
    expect(redesignResult.slides[2].content.title).toBe('Slide 3'); // Kept intact
    expect(mockContentGenerator.generateSlideContent).toHaveBeenCalledTimes(1);
  });
});
