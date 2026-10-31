import { describe, expect, it } from 'vitest';
import { LongTermMemory } from '../longTerm';
import { makePresentation, makeSlide, testTheme } from '../../../__tests__/fixtures';

describe('LongTermMemory', () => {
  it('saves and retrieves presentation history', async () => {
    const ltm = new LongTermMemory();
    const presentation = makePresentation([makeSlide(0), makeSlide(1), makeSlide(2)], {
      id: 'pres-1',
      title: 'Test Deck',
    });
    await ltm.savePresentation(presentation);
    const history = ltm.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0].id).toBe('pres-1');
    expect(history[0].topic).toBe('Test Deck');
    expect(history[0].slideCount).toBe(3);
    expect(history[0].theme).toBe('modern');
  });

  it('saves user feedback and rating for an existing record', async () => {
    const ltm = new LongTermMemory();
    await ltm.savePresentation(makePresentation([makeSlide(0)], { id: 'pres-1' }), 5);
    await ltm.saveFeedback('pres-1', 'Great slides!', 5);
    const record = ltm.getHistory().find((h) => h.id === 'pres-1');
    expect(record?.rating).toBe(5);
    expect(record?.feedback).toBe('Great slides!');
  });

  it('ignores feedback for unknown presentation ids', async () => {
    const ltm = new LongTermMemory();
    await expect(ltm.saveFeedback('missing', 'x', 1)).resolves.toBeUndefined();
    expect(ltm.getHistory()).toHaveLength(0);
  });

  it('tracks success patterns with counts sorted descending', () => {
    const ltm = new LongTermMemory();
    ltm.addSuccessPattern('chart');
    ltm.addSuccessPattern('title-bullets');
    ltm.addSuccessPattern('title-bullets');
    const patterns = ltm.getSuccessPatterns();
    expect(patterns[0].pattern).toBe('title-bullets');
    expect(patterns[0].count).toBe(2);
    expect(patterns[1].pattern).toBe('chart');
  });

  it('calculates average rating over rated presentations only', async () => {
    const ltm = new LongTermMemory();
    await ltm.savePresentation(makePresentation([makeSlide(0)], { id: 'a' }), 5);
    await ltm.savePresentation(makePresentation([makeSlide(0)], { id: 'b' }), 3);
    await ltm.savePresentation(makePresentation([makeSlide(0)], { id: 'c' })); // unrated
    expect(ltm.getAverageRating()).toBe(4);
  });

  it('returns empty average when no ratings', () => {
    const fresh = new LongTermMemory();
    expect(fresh.getAverageRating()).toBe(0);
  });

  it('provides aggregate stats with top themes', async () => {
    const ltm = new LongTermMemory();
    const corporate = { ...testTheme, name: 'corporate' };
    await ltm.savePresentation(makePresentation([makeSlide(0)], { id: 'a' }), 5);
    await ltm.savePresentation(
      makePresentation([makeSlide(0)], { id: 'b', theme: corporate }),
      4,
    );
    await ltm.savePresentation(
      makePresentation([makeSlide(0)], { id: 'c', theme: corporate }),
      3,
    );
    const stats = ltm.getStats();
    expect(stats.totalPresentations).toBe(3);
    expect(stats.averageRating).toBe(4);
    expect(stats.topThemes[0]).toBe('corporate');
    expect(stats.topThemes).toContain('modern');
  });

  it('returns a copy of history (mutations do not leak)', async () => {
    const ltm = new LongTermMemory();
    await ltm.savePresentation(makePresentation([makeSlide(0)], { id: 'a' }));
    ltm.getHistory().pop();
    expect(ltm.getHistory()).toHaveLength(1);
  });
});
