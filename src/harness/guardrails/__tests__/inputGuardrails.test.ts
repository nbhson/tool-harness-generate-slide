import { describe, expect, it } from 'vitest';
import { InputGuardrails } from '../inputGuardrails';

describe('InputGuardrails', () => {
  it('passes valid input', async () => {
    const g = new InputGuardrails();
    const res = await g.validate('An introduction to machine learning for beginners');
    expect(res.passed).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it('rejects too-short input', async () => {
    const g = new InputGuardrails();
    const res = await g.validate('hi');
    expect(res.passed).toBe(false);
    expect(res.errors.some((e) => e.includes('too short'))).toBe(true);
  });

  it('warns (but does not fail) for very long input', async () => {
    const g = new InputGuardrails({ maxLength: 100 });
    const res = await g.validate('meaningful words '.repeat(20));
    expect(res.passed).toBe(true);
    expect(res.warnings.some((w) => w.includes('very long'))).toBe(true);
  });

  it('blocks configured blocked topics (case-insensitive)', async () => {
    const g = new InputGuardrails({ blockedTopics: ['Violence'] });
    const res = await g.validate('a presentation about violence in media today');
    expect(res.passed).toBe(false);
    expect(res.errors.some((e) => e.includes('blocked topic'))).toBe(true);
  });

  it('warns on harmful content patterns without failing', async () => {
    const g = new InputGuardrails();
    const res = await g.validate('how to hack into systems, a security lecture');
    expect(res.passed).toBe(true);
    expect(res.warnings.length).toBeGreaterThan(0);
  });

  it('warns when input lacks meaningful words', async () => {
    const g = new InputGuardrails();
    const res = await g.validate('ab cd ef');
    expect(res.passed).toBe(true);
    expect(res.warnings.some((w) => w.includes('meaningful content'))).toBe(true);
  });

  it('can disable moderation and topic validation', async () => {
    const g = new InputGuardrails({
      contentModeration: false,
      topicValidation: false,
      blockedTopics: ['violence'],
    });
    const res = await g.validate('a presentation about violence in media today');
    expect(res.passed).toBe(true);
    expect(res.errors).toHaveLength(0);
    expect(res.warnings).toHaveLength(0);
  });
});
