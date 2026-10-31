import { describe, expect, it } from 'vitest';
import { Validators } from '../validators';
import { makePresentation, makeSlide } from '../../../__tests__/fixtures';

describe('Validators.validateHTML', () => {
  it('accepts well-formed HTML', () => {
    const html = '<html><head></head><body><p>hi</p></body></html>';
    expect(Validators.validateHTML(html)).toEqual({ valid: true, errors: [] });
  });

  it('detects missing structural tags', () => {
    const res = Validators.validateHTML('<div>no structure</div>');
    expect(res.valid).toBe(false);
    expect(res.errors).toContain('Missing <html> tag');
    expect(res.errors).toContain('Missing <head> tag');
    expect(res.errors).toContain('Missing <body> tag');
  });

  it('detects mismatched open/close tags', () => {
    const res = Validators.validateHTML('<html><head></head><body><p>unclosed</body></html>');
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes('Mismatched HTML tags'))).toBe(true);
  });
});

describe('Validators.validateCSS', () => {
  it('accepts balanced CSS', () => {
    const css = '.slide { color: red; background: blue; }';
    expect(Validators.validateCSS(css)).toEqual({ valid: true, errors: [] });
  });

  it('detects unbalanced braces', () => {
    const res = Validators.validateCSS('.slide { color: red;');
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes('Unbalanced CSS braces'))).toBe(true);
  });
});

describe('Validators.validateSlideContent', () => {
  it('accepts valid slide content', () => {
    const res = Validators.validateSlideContent(makeSlide(0));
    expect(res.valid).toBe(true);
  });

  it('detects missing title', () => {
    const slide = makeSlide(0, { title: '' });
    const res = Validators.validateSlideContent(slide);
    expect(res.valid).toBe(false);
    expect(res.errors).toContain('Slide is missing a title');
  });

  it('detects invalid layout', () => {
    const slide = makeSlide(0, { layout: 'weird-layout' as never });
    const res = Validators.validateSlideContent(slide);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes('Invalid layout'))).toBe(true);
  });

  it('detects too many bullets', () => {
    const slide = makeSlide(0, { bullets: ['1', '2', '3', '4', '5', '6', '7', '8'] });
    const res = Validators.validateSlideContent(slide);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes('Too many bullets'))).toBe(true);
  });
});

describe('Validators.validatePresentationStructure', () => {
  it('accepts a correctly structured presentation', () => {
    const res = Validators.validatePresentationStructure(makePresentation());
    expect(res.valid).toBe(true);
    expect(res.errors).toEqual([]);
  });

  it('detects non-sequential slide indices', () => {
    const res = Validators.validatePresentationStructure(
      makePresentation([makeSlide(0), makeSlide(2)]),
    );
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes('incorrect index'))).toBe(true);
  });
});
