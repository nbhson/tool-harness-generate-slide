import { describe, expect, it } from 'vitest';
import { OutputGuardrails } from '../outputGuardrails';
import { makePresentation, makeSlide, testTheme } from '../../../__tests__/fixtures';

describe('OutputGuardrails', () => {
  const guardrails = new OutputGuardrails();

  it('passes a complete presentation', async () => {
    const res = await guardrails.validatePresentation(makePresentation());
    expect(res.passed).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it('errors when metadata is missing', async () => {
    const presentation = makePresentation();
    // @ts-expect-error intentionally invalid structure for the test
    presentation.metadata = undefined;
    const res = await guardrails.validatePresentation(presentation);
    expect(res.passed).toBe(false);
    expect(res.errors).toContain('Presentation metadata is missing');
  });

  it('warns on missing metadata topic and createdAt', async () => {
    const presentation = makePresentation(undefined, {
      metadata: {
        createdAt: '',
        updatedAt: '2026-01-01T00:00:00.000Z',
        language: 'en',
        aspectRatio: '16:9',
        totalSlides: 2,
        topic: '',
      },
    });
    const res = await guardrails.validatePresentation(presentation);
    expect(res.passed).toBe(true);
    expect(res.warnings).toContain('Metadata is missing topic information');
    expect(res.warnings).toContain('Metadata is missing creation date');
  });

  it('errors when theme is missing', async () => {
    const presentation = makePresentation();
    // @ts-expect-error intentionally invalid structure for the test
    presentation.theme = undefined;
    const res = await guardrails.validatePresentation(presentation);
    expect(res.passed).toBe(false);
    expect(res.errors).toContain('Presentation theme is missing');
  });

  it('errors on invalid aspect ratio', async () => {
    const presentation = makePresentation(undefined, {
      metadata: {
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        language: 'en',
        // @ts-expect-error invalid ratio on purpose
        aspectRatio: '21:9',
        totalSlides: 2,
        topic: 't',
      },
    });
    const res = await guardrails.validatePresentation(presentation);
    expect(res.passed).toBe(false);
    expect(res.errors.some((e) => e.includes('Invalid aspect ratio'))).toBe(true);
  });

  it('errors when a slide is missing content layout', async () => {
    const badSlide = makeSlide(0);
    // @ts-expect-error remove layout on purpose
    delete badSlide.content.layout;
    const res = await guardrails.validatePresentation(makePresentation([badSlide]));
    expect(res.passed).toBe(false);
    expect(res.errors.some((e) => e.includes('missing content layout'))).toBe(true);
  });

  it('warns about incomplete theme definitions', async () => {
    const incompleteTheme = {
      ...testTheme,
      colors: { ...testTheme.colors, primary: '', background: '', text: '' },
      fonts: undefined,
    };
    const presentation = makePresentation(undefined, {
      // @ts-expect-error partial theme on purpose
      theme: incompleteTheme,
    });
    const res = await guardrails.validatePresentation(presentation);
    expect(res.passed).toBe(true);
    expect(res.warnings).toContain('Theme is missing primary color');
    expect(res.warnings).toContain('Theme is missing background color');
    expect(res.warnings).toContain('Theme is missing text color');
    expect(res.warnings).toContain('Theme is missing font definitions');
  });
});
