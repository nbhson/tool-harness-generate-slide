import { describe, expect, it } from 'vitest';
import { WorkingMemory } from '../workingMemory';
import type { Slide } from '../../../schemas/slide.schema';

const slide = (id: string): Slide =>
  ({ id, index: 0, content: { title: id, bullets: [], layout: 'title-bullets' }, isValid: true, validationErrors: [] });

describe('WorkingMemory', () => {
  it('starts at slide index 0 with empty state', () => {
    const wm = new WorkingMemory();
    expect(wm.getCurrentSlideIndex()).toBe(0);
    expect(wm.getGeneratedSlides()).toEqual([]);
    expect(wm.hasPendingRetries()).toBe(false);
  });

  it('tracks current slide index', () => {
    const wm = new WorkingMemory();
    wm.setCurrentSlideIndex(3);
    expect(wm.getCurrentSlideIndex()).toBe(3);
  });

  it('stores and returns generated slides', () => {
    const wm = new WorkingMemory();
    wm.addGeneratedSlide(slide('a'));
    wm.addGeneratedSlide(slide('b'));
    const slides = wm.getGeneratedSlides();
    expect(slides).toHaveLength(2);
    expect(slides[0].id).toBe('a');
    // Returns a copy
    slides.push(slide('c') as any);
    expect(wm.getGeneratedSlides()).toHaveLength(2);
  });

  it('manages pending retries', () => {
    const wm = new WorkingMemory();
    wm.addPendingRetry(1, 'missing title');
    expect(wm.hasPendingRetries()).toBe(true);
    expect(wm.getPendingRetries()).toEqual(new Map([[1, 'missing title']]));
    wm.removePendingRetry(1);
    expect(wm.hasPendingRetries()).toBe(false);
  });

  it('maintains context window of last 10 items', () => {
    const wm = new WorkingMemory();
    for (let i = 0; i < 12; i++) wm.addToContextWindow(`c${i}`);
    const ctx = wm.getContextWindow();
    expect(ctx).toHaveLength(10);
    expect(ctx[0]).toBe('c2');
    expect(ctx[9]).toBe('c11');
  });

  it('uses scratch pad for arbitrary key/value storage', () => {
    const wm = new WorkingMemory();
    wm.setScratchPad('count', 5);
    wm.setScratchPad('labels', ['a', 'b']);
    expect(wm.getScratchPad<number>('count')).toBe(5);
    expect(wm.getScratchPad<string[]>('labels')).toEqual(['a', 'b']);
    expect(wm.getScratchPad('unknown')).toBeUndefined();
  });

  it('reset() restores initial state', () => {
    const wm = new WorkingMemory();
    wm.setCurrentSlideIndex(9);
    wm.addGeneratedSlide(slide('x'));
    wm.reset();
    expect(wm.getCurrentSlideIndex()).toBe(0);
    expect(wm.getGeneratedSlides()).toHaveLength(0);
    expect(wm.hasPendingRetries()).toBe(false);
  });
});