import { logger } from './logger';

const log = logger.child('CircuitBreaker');

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  /** Number of failures before opening circuit. Default: 3 */
  failureThreshold: number;
  /** Time in ms to wait before trying half-open. Default: 30000 */
  resetTimeoutMs: number;
  /** Number of successes in half-open before closing. Default: 2 */
  halfOpenSuccessThreshold: number;
}

const defaultConfig: CircuitBreakerConfig = {
  failureThreshold: 3,
  resetTimeoutMs: 30_000,
  halfOpenSuccessThreshold: 2,
};

/**
 * Circuit Breaker Pattern
 * 
 * Protects against cascading failures when an external service (LLM) is down.
 * States:
 *   - closed: Normal operation, requests pass through
 *   - open: Service known down, requests immediately fail
 *   - half-open: Testing if service recovered
 */
export class CircuitBreaker {
  private config: CircuitBreakerConfig;
  private state: CircuitState = 'closed';
  private failures = 0;
  private halfOpenSuccesses = 0;
  private lastFailureTime = 0;
  private name: string;

  constructor(name: string, config: Partial<CircuitBreakerConfig> = {}) {
    this.name = name;
    this.config = { ...defaultConfig, ...config };
  }

  /**
   * Execute a function through the circuit breaker.
   * If circuit is open, immediately returns fallback.
   */
  async execute<T>(
    fn: () => Promise<T>,
    fallback?: () => Promise<T>
  ): Promise<T> {
    // Check if circuit is open
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime >= this.config.resetTimeoutMs) {
        this.state = 'half-open';
        this.halfOpenSuccesses = 0;
        log.info(`Circuit half-open for ${this.name}, testing...`);
      } else {
        log.info(`Circuit open for ${this.name}, using fallback`);
        if (fallback) {
          return fallback();
        }
        throw new Error(`Circuit breaker open for ${this.name} (retry after ${Math.ceil((this.config.resetTimeoutMs - (Date.now() - this.lastFailureTime)) / 1000)}s)`);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      if (fallback) {
        return fallback();
      }
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === 'half-open') {
      this.halfOpenSuccesses++;
      if (this.halfOpenSuccesses >= this.config.halfOpenSuccessThreshold) {
        this.state = 'closed';
        this.failures = 0;
        log.info(`Circuit closed for ${this.name}`);
      }
    } else {
      this.failures = 0;
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === 'half-open') {
      this.state = 'open';
      log.warn(`Circuit re-opened for ${this.name}`);
    } else if (this.failures >= this.config.failureThreshold) {
      this.state = 'open';
      log.warn(`Circuit opened for ${this.name} after ${this.failures} failures`);
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  getFailures(): number {
    return this.failures;
  }

  /** Manually reset circuit to closed state */
  reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.halfOpenSuccesses = 0;
    log.info(`Circuit manually reset for ${this.name}`);
  }
}