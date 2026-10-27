import { describe, expect, it } from 'vitest';
import { SlideGuardrails } from '../slideGuardrails';
import type { Slide } from '../../../schemas/slide.schema';

describe('SlideGuardrails', () => {
  const guardrails = new SlideGuardrails({
    maxBulletsPerSlide: 5,
    maxTextLength: 200,
    requiredTitle: true,
  });

  const validSlide: Slide = {
    id: 's1',
    index: 0,
    content: {
      title: 'Valid Slide Title',
      subtitle: 'Subtitle',
      bullets: ['Bullet 1', 'Bullet 2'],
      layout: 'title-bullets',
    },
    isValid: false,
    validationErrors: [],
  };

  it('should pass validation for valid slide', async () => {
    const res = await guardrails.validateSlide(validSlide);
    expect(res.passed).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it('should detect missing title', async () => {
    const invalidSlide: Slide = {
      ...validSlide,
      content: { ...validSlide.content, title: '' },
    };
    const res = await guardrails.validateSlide(invalidSlide);
    expect(res.passed).toBe(false);
    expect(res.errors).toContain('Slide is missing a title');
  });

  it('should detect too many bullets', async () => {
    const invalidSlide: Slide = {
      ...validSlide,
      content: {
        ...validSlide.content,
        bullets: ['1', '2', '3', '4', '6', '7'],
      },
    };
    const res = await guardrails.validateSlide(invalidSlide);
    expect(res.passed).toBe(false);
    expect(res.errors.some((e) => e.includes('Too many bullet points'))).toBe(true);
  });

  it('should perform parallel validation across array of slides', async () => {
    const slides = [validSlide, { ...validSlide, id: 's2', index: 1 }];
    const { allPassed, results } = await guardrails.validateSlides(slides);

    expect(allPassed).toBe(true);
    expect(results).toHaveLength(2);
  });
});
