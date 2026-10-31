import { describe, expect, it } from 'vitest';
import {
  ContentGenerationError,
  DesignError,
  EvaluationError,
  ExportError,
  formatError,
  getErrorMessage,
  InputValidationError,
  isSlideHarnessError,
  LLMConnectionError,
  LLMError,
  LLMUnavailableError,
  PlanningError,
  SlideHarnessError,
  ThemeError,
  ValidationError,
} from '../errors';

describe('SlideHarnessError', () => {
  it('carries code, statusCode, context and cause', () => {
    const cause = new Error('root cause');
    const err = new SlideHarnessError('boom', {
      code: 'TEST',
      statusCode: 500,
      context: { a: 1 },
      cause,
    });
    expect(err.name).toBe('SlideHarnessError');
    expect(err.code).toBe('TEST');
    expect(err.statusCode).toBe(500);
    expect(err.context).toEqual({ a: 1 });
    expect(err.cause).toBe(cause);
  });

  it('defaults code to SLIDE_HARNESS_ERROR and serializes via toJSON', () => {
    const err = new SlideHarnessError('boom', { cause: new Error('inner') });
    const json = err.toJSON();
    expect(json.code).toBe('SLIDE_HARNESS_ERROR');
    expect(json.message).toBe('boom');
    expect(json.cause).toBe('inner');
  });

  it('serializes non-Error cause as-is', () => {
    const json = new SlideHarnessError('boom', { cause: 'string-cause' }).toJSON();
    expect(json.cause).toBe('string-cause');
  });
});

describe('error subclasses', () => {
  it('LLMError uses LLM_ERROR code and model context', () => {
    const err = new LLMError('api failed', { model: 'gpt-x', statusCode: 429 });
    expect(err.code).toBe('LLM_ERROR');
    expect(err.statusCode).toBe(429);
    expect(err.context).toEqual({ model: 'gpt-x' });
  });

  it('LLMConnectionError includes URL and statusCode 0', () => {
    const err = new LLMConnectionError('http://localhost:3000');
    expect(err.message).toContain('http://localhost:3000');
    expect(err.statusCode).toBe(0);
    expect(err instanceof LLMError).toBe(true);
  });

  it('LLMUnavailableError reports attempts with 503', () => {
    const err = new LLMUnavailableError(3);
    expect(err.message).toContain('3 fallback attempts');
    expect(err.statusCode).toBe(503);
  });

  it('ContentGenerationError names the slide', () => {
    const err = new ContentGenerationError('Intro');
    expect(err.message).toContain('Intro');
    expect(err.context).toEqual({ slideTitle: 'Intro' });
  });

  it('ValidationError carries validation errors list', () => {
    const err = new ValidationError('bad', ['e1', 'e2']);
    expect(err.validationErrors).toEqual(['e1', 'e2']);
    expect(err.code).toBe('VALIDATION_ERROR');
  });

  it('ExportError records output path', () => {
    const err = new ExportError('disk full', { outputPath: '/tmp/a.pptx' });
    expect(err.context).toEqual({ outputPath: '/tmp/a.pptx' });
    expect(err.code).toBe('EXPORT_ERROR');
  });

  it('ThemeError lists available themes', () => {
    const err = new ThemeError('nope', ['modern', 'minimal']);
    expect(err.message).toContain('"nope"');
    expect(err.context?.availableThemes).toEqual(['modern', 'minimal']);
  });

  it('InputValidationError extends ValidationError', () => {
    const err = new InputValidationError('theme', 'unknown theme');
    expect(err instanceof ValidationError).toBe(true);
    expect(err.validationErrors).toEqual(['unknown theme']);
    expect(err.message).toContain('theme');
  });

  it('PlanningError and DesignError carry structured context', () => {
    const planning = new PlanningError('bad outline', ['e1']);
    expect(planning.code).toBe('PLANNING_ERROR');
    expect(planning.context?.errors).toEqual(['e1']);

    const design = new DesignError('bad design', { slideIndex: 2, errors: ['x'] });
    expect(design.code).toBe('DESIGN_ERROR');
    expect(design.context).toEqual({ slideIndex: 2, errors: ['x'] });
  });

  it('EvaluationError records attempt info', () => {
    const err = new EvaluationError('eval failed', { attempt: 2, failedSlides: [0, 1] });
    expect(err.code).toBe('EVALUATION_ERROR');
    expect(err.context).toEqual({ attempt: 2, failedSlides: [0, 1], errors: undefined });
  });
});

describe('helpers', () => {
  it('isSlideHarnessError', () => {
    expect(isSlideHarnessError(new SlideHarnessError('x'))).toBe(true);
    expect(isSlideHarnessError(new LLMError('x'))).toBe(true);
    expect(isSlideHarnessError(new Error('x'))).toBe(false);
    expect(isSlideHarnessError('nope')).toBe(false);
  });

  it('getErrorMessage', () => {
    expect(getErrorMessage(new SlideHarnessError('harness'))).toBe('harness');
    expect(getErrorMessage(new Error('plain'))).toBe('plain');
    expect(getErrorMessage(42)).toBe('42');
  });

  it('formatError', () => {
    expect(formatError(new LLMError('api down', { model: 'm' }))).toBe('[LLM_ERROR] api down ({"model":"m"})');
    expect(formatError(new Error('plain'))).toBe('[Error] plain');
    expect(formatError('weird')).toBe('[Unknown] weird');
  });
});
