import { describe, expect, it } from 'vitest';
import { ShortTermMemory } from '../shortTerm';

describe('ShortTermMemory', () => {
  it('starts with defaults', () => {
    const stm = new ShortTermMemory();
    expect(stm.getCurrentTopic()).toBe('');
    expect(stm.getGeneratedSlidesCount()).toBe(0);
    expect(stm.getErrors()).toEqual([]);
  });

  it('stores and retrieves the current topic', () => {
    const stm = new ShortTermMemory();
    stm.setCurrentTopic('AI trends');
    expect(stm.getCurrentTopic()).toBe('AI trends');
  });

  it('increments generated slides count', () => {
    const stm = new ShortTermMemory();
    stm.incrementGeneratedSlides();
    stm.incrementGeneratedSlides();
    expect(stm.getGeneratedSlidesCount()).toBe(2);
  });

  it('accumulates and exposes errors', () => {
    const stm = new ShortTermMemory();
    stm.addError('Slide 1 failed');
    stm.addError('Slide 2 failed');
    expect(stm.getErrors()).toEqual(['Slide 1 failed', 'Slide 2 failed']);
  });

  it('returns a copy of session data', () => {
    const stm = new ShortTermMemory();
    stm.incrementGeneratedSlides();
    const data = stm.getSessionData();
    expect(data.generatedSlides).toBe(1);
  });

  it('reset() restores defaults', () => {
    const stm = new ShortTermMemory();
    stm.setCurrentTopic('x');
    stm.incrementGeneratedSlides();
    stm.reset();
    expect(stm.getCurrentTopic()).toBe('');
    expect(stm.getGeneratedSlidesCount()).toBe(0);
  });

  it('can update preferences', () => {
    const stm = new ShortTermMemory();
    stm.updatePreferences({ maxSlides: 30, language: 'en' });
    const prefs = stm.getPreferences();
    expect(prefs.maxSlides).toBe(30);
    expect(prefs.language).toBe('en');
  });
});