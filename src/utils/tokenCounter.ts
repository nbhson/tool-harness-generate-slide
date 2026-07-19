import { countTokens } from './helpers';

export class TokenCounter {
  private totalTokens: number = 0;
  private requestCount: number = 0;

  count(text: string): number {
    const tokens = countTokens(text);
    this.totalTokens += tokens;
    this.requestCount++;
    return tokens;
  }

  getTotal(): number {
    return this.totalTokens;
  }

  getRequestCount(): number {
    return this.requestCount;
  }

  reset(): void {
    this.totalTokens = 0;
    this.requestCount = 0;
  }

  getStats(): { totalTokens: number; requestCount: number; avgTokensPerRequest: number } {
    return {
      totalTokens: this.totalTokens,
      requestCount: this.requestCount,
      avgTokensPerRequest: this.requestCount > 0 ? Math.round(this.totalTokens / this.requestCount) : 0,
    };
  }
}

export const tokenCounter = new TokenCounter();