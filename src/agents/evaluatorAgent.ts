import type { Presentation } from '../schemas/presentation.schema';
import type { DeckGuardrails } from '../harness/guardrails/deckGuardrails';
import type { SlideGuardrails } from '../harness/guardrails/slideGuardrails';
import type { FeedbackLoop } from '../harness/feedback/feedbackLoop';
import { logger } from '../utils/logger';

const log = logger.child('EvaluatorAgent');

export interface EvaluatorResult {
  approved: boolean;
  feedback: string[];
  errors: string[];
}

export class EvaluatorAgent {
  private deckGuardrails: DeckGuardrails;
  private slideGuardrails: SlideGuardrails;
  private feedbackLoop: FeedbackLoop;
  private maxRetries: number;

  constructor(
    deckGuardrails: DeckGuardrails,
    slideGuardrails: SlideGuardrails,
    feedbackLoop: FeedbackLoop,
    maxRetries: number = 3,
  ) {
    this.deckGuardrails = deckGuardrails;
    this.slideGuardrails = slideGuardrails;
    this.feedbackLoop = feedbackLoop;
    this.maxRetries = maxRetries;
  }

  async evaluate(presentation: Presentation, attempt: number = 1): Promise<EvaluatorResult> {
    log.info('Evaluating presentation...', {
      slideCount: presentation.slides.length,
      attempt,
    });

    const feedback: string[] = [];
    const errors: string[] = [];

    // Validate individual slides
    const slideValidation = await this.slideGuardrails.validateSlides(presentation.slides);
    if (!slideValidation.allPassed) {
      for (let i = 0; i < slideValidation.results.length; i++) {
        const result = slideValidation.results[i];
        if (!result.passed) {
          const slideErrors = result.errors.map((e) => `Slide ${i + 1}: ${e}`);
          errors.push(...slideErrors);
        }
      }
    }

    // Validate deck level
    const deckValidation = await this.deckGuardrails.validate(presentation);
    if (!deckValidation.passed) {
      errors.push(...deckValidation.errors);
    }
    feedback.push(...deckValidation.warnings);

    const approved = errors.length === 0;

    if (!approved) {
      log.warn('Presentation not approved', {
        errorCount: errors.length,
        feedbackCount: feedback.length,
      });
    } else {
      log.info('Presentation approved');
    }

    return { approved, feedback, errors };
  }
}
