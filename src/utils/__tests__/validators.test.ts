import { describe, expect, it } from 'vitest';
import {
  AVAILABLE_LANGUAGES,
  AVAILABLE_THEMES,
  OptionValidationError,
  validateAspectRatio,
  validateGenerateOptions,
  validateLanguage,
  validateMaxSlides,
  validateOutputPath,
  validateTheme,
  validateTopic,
} from '../validators';

describe('validateTheme', () => {
  it('accepts all available themes', () => {
    for (const theme of AVAILABLE_THEMES) {
      expect(validateTheme(theme)).toBe(theme);
    }
  });

  it('rejects unknown theme', () => {
    expect(() => validateTheme('nope')).toThrow(OptionValidationError);
    try {
      validateTheme('nope');
    } catch (e) {
      const err = e as OptionValidationError;
      expect(err.option).toBe('--theme');
      expect(err.message).toContain('Available themes');
    }
  });
});

describe('validateLanguage', () => {
  it('accepts supported languages', () => {
    for (const lang of AVAILABLE_LANGUAGES) {
      expect(validateLanguage(lang)).toBe(lang);
    }
  });

  it('rejects unknown language', () => {
    expect(() => validateLanguage('fr')).toThrow(OptionValidationError);
  });
});

describe('validateAspectRatio', () => {
  it('accepts 16:9 and 4:3', () => {
    expect(validateAspectRatio('16:9')).toBe('16:9');
    expect(validateAspectRatio('4:3')).toBe('4:3');
  });

  it('rejects other ratios', () => {
    expect(() => validateAspectRatio('21:9')).toThrow(OptionValidationError);
  });
});

describe('validateMaxSlides', () => {
  it('accepts numbers and numeric strings within 1-50', () => {
    expect(validateMaxSlides(10)).toBe(10);
    expect(validateMaxSlides('20')).toBe(20);
    expect(validateMaxSlides(1)).toBe(1);
    expect(validateMaxSlides(50)).toBe(50);
  });

  it('rejects NaN strings', () => {
    expect(() => validateMaxSlides('abc')).toThrow(OptionValidationError);
  });

  it('rejects out-of-range values', () => {
    expect(() => validateMaxSlides(0)).toThrow(OptionValidationError);
    expect(() => validateMaxSlides(51)).toThrow(OptionValidationError);
  });
});

describe('validateOutputPath', () => {
  it('accepts .pptx paths (case-insensitive)', () => {
    expect(validateOutputPath('deck.pptx')).toBe('deck.pptx');
    expect(validateOutputPath('deck.PPTX')).toBe('deck.PPTX');
  });

  it('rejects empty and non-pptx paths', () => {
    expect(() => validateOutputPath('')).toThrow(OptionValidationError);
    expect(() => validateOutputPath('deck.pdf')).toThrow(OptionValidationError);
  });
});

describe('validateTopic', () => {
  it('trims and accepts a valid topic', () => {
    expect(validateTopic('  AI in education  ')).toBe('AI in education');
  });

  it('rejects empty, whitespace and too-short topics', () => {
    expect(() => validateTopic('')).toThrow(OptionValidationError);
    expect(() => validateTopic('   ')).toThrow(OptionValidationError);
    expect(() => validateTopic('ab')).toThrow(OptionValidationError);
  });

  it('rejects overly long topics', () => {
    expect(() => validateTopic('x'.repeat(50001))).toThrow(OptionValidationError);
  });
});

describe('validateGenerateOptions', () => {
  it('returns empty list for valid options', () => {
    const errors = validateGenerateOptions({
      topic: 'A valid topic',
      theme: 'modern',
      language: 'vi',
      maxSlides: 10,
      aspectRatio: '16:9',
      output: 'out.pptx',
    });
    expect(errors).toEqual([]);
  });

  it('collects all errors for invalid options', () => {
    const errors = validateGenerateOptions({
      topic: 'ab',
      theme: 'nope',
      language: 'fr',
      maxSlides: 100,
      aspectRatio: '21:9',
      output: 'out.pdf',
    });
    expect(errors).toHaveLength(6);
    expect(errors.every((e) => typeof e === 'string' && e.length > 0)).toBe(true);
  });

  it('ignores undefined fields', () => {
    expect(validateGenerateOptions({})).toEqual([]);
  });
});
