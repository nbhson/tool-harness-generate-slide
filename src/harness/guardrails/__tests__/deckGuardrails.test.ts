import { describe, expect, it } from 'vitest';
import { DeckGuardrails } from '../deckGuardrails';
import { makePresentation, makeSlide } from '../../../__tests__/fixtures';

describe('DeckGuardrails', () => {
  const guardrails = new DeckGuardrails();

  it('passes a well-formed deck', async () => {
    const presentation = makePresentation([
      makeSlide(0, { layout: 'title', bullets: [] }),
      makeSlide(1),
      makeSlide(2, { title: 'Summary', bullets: [] }),
    ]);
    const res = await guardrails.validate(presentation);
    expect(res.passed).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it('errors when slide count exceeds maxSlides', async () => {
    const strict = new DeckGuardrails({ maxSlides: 3 });
    const slides = Array.from({ length: 5 }, (_, i) => makeSlide(i));
    const res = await strict.validate(makePresentation(slides));
    expect(res.passed).toBe(false);
    expect(res.errors.some((e) => e.includes('Too many slides'))).toBe(true);
  });

  it('warns when slide count is below minSlides', async () => {
    const strict = new DeckGuardrails({ minSlides: 5 });
    const res = await strict.validate(makePresentation([makeSlide(0), makeSlide(1)]));
    expect(res.warnings.some((w) => w.includes('only 2 slides'))).toBe(true);
  });

  it('errors when presentation has no title', async () => {
    const res = await guardrails.validate(makePresentation([makeSlide(0)], { title: '  ' }));
    expect(res.passed).toBe(false);
    expect(res.errors).toContain('Presentation must have a title');
  });

  it('warns when first slide is not a title slide', async () => {
    const res = await guardrails.validate(makePresentation([makeSlide(0), makeSlide(1)]));
    expect(res.warnings).toContain('First slide should be a title slide');
  });

  it('warns when last slide is not a closing slide', async () => {
    const res = await guardrails.validate(
      makePresentation([makeSlide(0, { layout: 'title', bullets: [] }), makeSlide(1)]),
    );
    expect(res.warnings.some((w) => w.includes('conclusion or thank-you'))).toBe(true);
  });

  it('warns on duplicate slide titles', async () => {
    const res = await guardrails.validate(
      makePresentation([
        makeSlide(0, { layout: 'title', bullets: [] }),
        makeSlide(1, { title: 'same title' }),
        makeSlide(2, { title: 'Same Title ' }),
      ]),
    );
    expect(res.warnings).toContain('Some slides have duplicate titles');
  });

  it('warns when all slides share the same layout', async () => {
    const uniform = new DeckGuardrails();
    const slides = Array.from({ length: 5 }, (_, i) => makeSlide(i));
    const res = await uniform.validate(makePresentation(slides));
    expect(res.warnings.some((w) => w.includes('same layout'))).toBe(true);
  });

  it('warns when average text per slide is high', async () => {
    const longBullets = ['x'.repeat(400), 'y'.repeat(400)];
    const res = await guardrails.validate(
      makePresentation([
        makeSlide(0, { layout: 'title', bullets: [] }),
        makeSlide(1, { bullets: longBullets }),
      ]),
    );
    expect(res.warnings.some((w) => w.includes('text content per slide is high'))).toBe(true);
  });

  it('respects disabled checks', async () => {
    const lenient = new DeckGuardrails({
      coherenceCheck: false,
      consistentStyle: false,
    });
    const res = await lenient.validate(
      makePresentation([makeSlide(0), makeSlide(1), makeSlide(2)]),
    );
    expect(res.passed).toBe(true);
    expect(res.warnings).toHaveLength(0);
  });
});
