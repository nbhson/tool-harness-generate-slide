import type { Presentation } from '../../schemas/presentation.schema';
import type { Slide } from '../../schemas/slide.schema';
import type { LongTermMemory } from '../memory/longTerm';
import { logger } from '../../utils/logger';

export interface FeedbackMetrics {
  successRate: number;
  avgGenerationTime: number;
  userSatisfaction: number;
  retryRate: number;
}

export interface ValidationFailureContext {
  error: string;
  slide?: Slide;
  stage: 'planning' | 'design' | 'evaluation' | 'export';
  attempt: number;
}

const log = logger.child('FeedbackLoop');

export class FeedbackLoop {
  private longTermMemory: LongTermMemory;
  private metrics: FeedbackMetrics;
  private totalAttempts: number = 0;
  private successfulAttempts: number = 0;
  private retryCount: number = 0;
  private totalGenerationTime: number = 0;

  constructor(longTermMemory: LongTermMemory) {
    this.longTermMemory = longTermMemory;
    this.metrics = {
      successRate: 0,
      avgGenerationTime: 0,
      userSatisfaction: 0,
      retryRate: 0,
    };
  }

  async onValidationFailure(
    context: ValidationFailureContext,
  ): Promise<{ shouldRetry: boolean; feedback: string }> {
    log.warn('Validation failure', {
      error: context.error,
      stage: context.stage,
      attempt: context.attempt,
    });
    this.retryCount++;

    const maxRetries = 3;
    const shouldRetry = context.attempt < maxRetries;

    let feedback = '';
    if (context.error.includes('title')) {
      feedback = 'Ensure the slide has a clear, descriptive title between 3-100 characters.';
    } else if (context.error.includes('bullet')) {
      feedback = 'Reduce the number of bullet points to maximum 7 per slide. Be concise.';
    } else if (context.error.includes('length')) {
      feedback = 'Reduce the total text content. Keep it concise and impactful.';
    } else if (context.error.includes('layout')) {
      feedback =
        'Use a valid layout type: title, title-bullets, two-column, image-left, full-image, chart, quote.';
    } else {
      feedback = 'Review the slide content and ensure it meets all quality criteria.';
    }

    if (!shouldRetry) {
      log.error('Max retries exceeded', { stage: context.stage });
    }

    return { shouldRetry, feedback };
  }

  async onUserRating(rating: number, presentation: Presentation): Promise<void> {
    log.info('User rating received', { rating, presentationId: presentation.id });
    await this.longTermMemory.savePresentation(presentation, rating);

    this.metrics.userSatisfaction = this.longTermMemory.getAverageRating();

    if (rating < 3) {
      log.info('Low rating - suggesting alternative design');
    }

    if (rating >= 4) {
      // Extract success patterns
      const layouts = presentation.slides.map((s) => s.content.layout);
      this.longTermMemory.addSuccessPattern(`layouts:${layouts.join(',')}`);
    }
  }

  recordAttempt(duration: number, success: boolean): void {
    this.totalAttempts++;
    if (success) this.successfulAttempts++;
    this.totalGenerationTime += duration;

    this.metrics.successRate = this.successfulAttempts / this.totalAttempts;
    this.metrics.avgGenerationTime = this.totalGenerationTime / this.totalAttempts;
    this.metrics.retryRate = this.retryCount / Math.max(this.totalAttempts, 1);
  }

  getMetrics(): FeedbackMetrics {
    return { ...this.metrics };
  }
}
