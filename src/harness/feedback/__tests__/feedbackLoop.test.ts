import { describe, expect, it } from 'vitest';
import { FeedbackLoop } from '../feedbackLoop';
import { LongTermMemory } from '../../memory/longTerm';
import { makePresentation, makeSlide } from '../../../__tests__/fixtures';

describe('FeedbackLoop', () => {
  it('suggests title-specific feedback and retries below max attempts', async () => {
    const loop = new FeedbackLoop(new LongTermMemory());
    const res = await loop.onValidationFailure({
      error: 'Slide is missing a title',
      stage: 'design',
      attempt: 1,
    });
    expect(res.shouldRetry).toBe(true);
    expect(res.feedback).toContain('title');
  });

  it('suggests bullet-specific feedback', async () => {
    const loop = new FeedbackLoop(new LongTermMemory());
    const res = await loop.onValidationFailure({
      error: 'Too many bullet points',
      stage: 'design',
      attempt: 1,
    });
    expect(res.feedback).toContain('bullet');
  });

  it('suggests layout-specific feedback', async () => {
    const loop = new FeedbackLoop(new LongTermMemory());
    const res = await loop.onValidationFailure({
      error: 'Invalid layout detected',
      stage: 'design',
      attempt: 1,
    });
    expect(res.feedback).toContain('layout type');
  });

  it('stops retrying after max attempts (3)', async () => {
    const loop = new FeedbackLoop(new LongTermMemory());
    const ctx = { error: 'something else', stage: 'export' as const, attempt: 3 };
    const res = await loop.onValidationFailure(ctx);
    expect(res.shouldRetry).toBe(false);
    expect(res.feedback).toContain('quality criteria');
  });

  it('records attempts and computes metrics', () => {
    const loop = new FeedbackLoop(new LongTermMemory());
    loop.recordAttempt(100, true);
    loop.recordAttempt(300, false);
    const metrics = loop.getMetrics();
    expect(metrics.successRate).toBeCloseTo(0.5);
    expect(metrics.avgGenerationTime).toBe(200);
  });

  it('records user ratings and success patterns for high ratings', async () => {
    const ltm = new LongTermMemory();
    const loop = new FeedbackLoop(ltm);
    const presentation = makePresentation([makeSlide(0), makeSlide(1)]);
    await loop.onUserRating(5, presentation);
    expect(ltm.getAverageRating()).toBe(5);
    expect(ltm.getSuccessPatterns().length).toBeGreaterThan(0);
  });

  it('does not add success patterns for low ratings', async () => {
    const ltm = new LongTermMemory();
    const loop = new FeedbackLoop(ltm);
    await loop.onUserRating(2, makePresentation([makeSlide(0)]));
    expect(ltm.getSuccessPatterns()).toHaveLength(0);
  });
});
