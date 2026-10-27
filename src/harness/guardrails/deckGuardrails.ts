import type { Presentation } from '../../schemas/presentation.schema';
import { logger } from '../../utils/logger';

export interface DeckGuardrailResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
}

export interface DeckGuardrailConfig {
  maxSlides: number;
  coherenceCheck: boolean;
  brandCompliance: boolean;
  noHallucination: boolean;
  consistentStyle: boolean;
  minSlides: number;
}

const defaultConfig: DeckGuardrailConfig = {
  maxSlides: 30,
  coherenceCheck: true,
  brandCompliance: true,
  noHallucination: true,
  consistentStyle: true,
  minSlides: 3,
};

const log = logger.child('DeckGuardrails');

export class DeckGuardrails {
  private config: DeckGuardrailConfig;

  constructor(config: Partial<DeckGuardrailConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
  }

  async validate(presentation: Presentation): Promise<DeckGuardrailResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    log.info('Validating presentation deck...');

    // Slide count validation
    if (presentation.slides.length > this.config.maxSlides) {
      errors.push(`Too many slides (${presentation.slides.length}, max ${this.config.maxSlides})`);
    }

    if (presentation.slides.length < this.config.minSlides) {
      warnings.push(
        `Presentation has only ${presentation.slides.length} slides (recommended min: ${this.config.minSlides})`,
      );
    }

    // Coherence check
    if (this.config.coherenceCheck) {
      const coherenceResult = this.checkCoherence(presentation);
      errors.push(...coherenceResult.errors);
      warnings.push(...coherenceResult.warnings);
    }

    // Style consistency check
    if (this.config.consistentStyle) {
      const styleResult = this.checkStyleConsistency(presentation);
      errors.push(...styleResult.errors);
      warnings.push(...styleResult.warnings);
    }

    // Check for duplicate slides
    const duplicateResult = this.checkDuplicates(presentation);
    warnings.push(...duplicateResult.warnings);

    const passed = errors.length === 0;

    log.info(passed ? 'Deck validation passed' : 'Deck validation failed', {
      errors,
      warnings,
    });

    return { passed, errors, warnings };
  }

  private checkCoherence(presentation: Presentation): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check title exists
    if (!presentation.title || presentation.title.trim().length === 0) {
      errors.push('Presentation must have a title');
    }

    // Check first slide is title slide
    const firstSlide = presentation.slides[0];
    if (firstSlide && firstSlide.content.layout !== 'title') {
      warnings.push('First slide should be a title slide');
    }

    // Check last slide is CTA or summary
    const lastSlide = presentation.slides[presentation.slides.length - 1];
    if (lastSlide) {
      const lastTitle = (lastSlide.content.title || '').toLowerCase();
      const hasClosing = ['thank', 'summary', 'conclusion', 'cta', 'q&a', 'contact'].some(
        (keyword) => lastTitle.includes(keyword),
      );
      if (!hasClosing) {
        warnings.push('Last slide typically should be a conclusion or thank-you slide');
      }
    }

    return { errors, warnings };
  }

  private checkStyleConsistency(presentation: Presentation): {
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (presentation.slides.length === 0) {
      return { errors, warnings };
    }

    // Check layout variety
    const layouts = new Set(presentation.slides.map((s) => s.content.layout));
    if (layouts.size === 1 && presentation.slides.length > 3) {
      warnings.push(
        'All slides use the same layout. Consider adding variety for better engagement.',
      );
    }

    // Check for excessive text across slides
    const avgTextLength =
      presentation.slides.reduce((sum, s) => {
        return sum + (s.content.bullets || []).join(' ').length;
      }, 0) / presentation.slides.length;

    if (avgTextLength > 300) {
      warnings.push(
        'Average text content per slide is high. Consider reducing text for better readability.',
      );
    }

    return { errors, warnings };
  }

  private checkDuplicates(presentation: Presentation): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    const titles = presentation.slides.map((s) => s.content.title?.toLowerCase().trim());
    const titleSet = new Set(titles);

    if (titleSet.size < titles.length) {
      warnings.push('Some slides have duplicate titles');
    }

    return { errors, warnings };
  }
}
