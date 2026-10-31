import { describe, expect, it } from 'vitest';
import { countTokens, TokenCounter } from '../tokenCounter';

describe('countTokens', () => {
  it('estimates ~3.5 chars per token, rounded up', () => {
    expect(countTokens('')).toBe(0);
    expect(countTokens('a')).toBe(1);
    expect(countTokens('a'.repeat(7))).toBe(2);
    expect(countTokens('a'.repeat(35))).toBe(10);
  });
});

describe('TokenCounter', () => {
  it('accumulates totals and request counts', () => {
    const counter = new TokenCounter();
    counter.count('a'.repeat(35)); // 10 tokens
    counter.count('b'.repeat(35)); // 10 tokens
    expect(counter.getTotal()).toBe(20);
    expect(counter.getRequestCount()).toBe(2);
    expect(counter.getStats()).toEqual({ totalTokens: 20, requestCount: 2, avgTokensPerRequest: 10 });
  });

  it('returns avgTokensPerRequest 0 when no requests yet', () => {
    const counter = new TokenCounter();
    expect(counter.getStats()).toEqual({ totalTokens: 0, requestCount: 0, avgTokensPerRequest: 0 });
  });

  it('reset() clears all state', () => {
    const counter = new TokenCounter();
    counter.count('hello world, this is some text');
    counter.reset();
    expect(counter.getTotal()).toBe(0);
    expect(counter.getRequestCount()).toBe(0);
  });
});
