import { describe, it, expect, vi } from 'vitest';
import { CircuitBreaker } from '../circuitBreaker';

describe('CircuitBreaker', () => {
  it('should execute primary function when closed', async () => {
    const cb = new CircuitBreaker('test', { failureThreshold: 2 });
    const primary = vi.fn().mockResolvedValue('ok');
    const fallback = vi.fn().mockResolvedValue('fallback');

    const res = await cb.execute(primary, fallback);

    expect(res).toBe('ok');
    expect(primary).toHaveBeenCalledTimes(1);
    expect(fallback).not.toHaveBeenCalled();
    expect(cb.getState()).toBe('closed');
  });

  it('should transition to open after consecutive failures and invoke fallback', async () => {
    const cb = new CircuitBreaker('test', { failureThreshold: 2, resetTimeoutMs: 1000 });
    const primary = vi.fn().mockRejectedValue(new Error('service error'));
    const fallback = vi.fn().mockResolvedValue('fallback_value');

    // First failure
    await cb.execute(primary, fallback);
    expect(cb.getState()).toBe('closed');

    // Second failure triggers threshold -> open state
    const res2 = await cb.execute(primary, fallback);
    expect(res2).toBe('fallback_value');
    expect(cb.getState()).toBe('open');

    // Subsequent call while open bypasses primary completely
    primary.mockClear();
    fallback.mockClear();
    const res3 = await cb.execute(primary, fallback);
    expect(res3).toBe('fallback_value');
    expect(primary).not.toHaveBeenCalled();
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it('should transition to half-open after timeout and recover on success', async () => {
    vi.useFakeTimers();
    const cb = new CircuitBreaker('test', { failureThreshold: 1, resetTimeoutMs: 500, halfOpenSuccessThreshold: 1 });
    const primaryFail = vi.fn().mockRejectedValue(new Error('fail'));
    const fallback = vi.fn().mockResolvedValue('fallback');

    await cb.execute(primaryFail, fallback);
    expect(cb.getState()).toBe('open');

    // Advance time past reset timeout
    vi.advanceTimersByTime(600);

    const primarySuccess = vi.fn().mockResolvedValue('recovered');
    const res = await cb.execute(primarySuccess, fallback);

    expect(res).toBe('recovered');
    expect(cb.getState()).toBe('closed');
    vi.useRealTimers();
  });
});
