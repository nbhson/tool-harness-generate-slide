import type { Slide, SlideContent } from '../../schemas/slide.schema';
import { logger } from '../../utils/logger';

export interface SlideGuardrailResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
}

export interface SlideGuardrailConfig {
  maxBulletsPerSlide: number;
  minFontSize: number;
  maxTextLength: number;
  requiredTitle: boolean;
  maxImages: number;
  minTitleLength: number;
  maxTitleLength: number;
}

const defaultConfig: SlideGuardrailConfig = {
  maxBulletsPerSlide: 8,
  minFontSize: 14,
  maxTextLength: 5000,
  requiredTitle: true,
  maxImages: 4,
  minTitleLength: 3,
  maxTitleLength: 120,
};

const log = logger.child('SlideGuardrails');

export class SlideGuardrails {
  private config: SlideGuardrailConfig;

  constructor(config: Partial<SlideGuardrailConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
  }

  async validateSlide(slide: Slide): Promise<SlideGuardrailResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    log.info(`Validating slide ${slide.index}...`, { slideId: slide.id });

    const content = slide.content;

    // Title validation
    if (this.config.requiredTitle && (!content.title || content.title.trim().length === 0)) {
      errors.push('Slide is missing a title');
    }

    if (content.title) {
      if (content.title.length < this.config.minTitleLength) {
        errors.push(`Title is too short (minimum ${this.config.minTitleLength} characters)`);
      }
      if (content.title.length > this.config.maxTitleLength) {
        warnings.push(
          `Title is very long (${content.title.length} characters, recommended max ${this.config.maxTitleLength})`,
        );
      }
    }

    // Bullets validation
    if (content.bullets && content.bullets.length > this.config.maxBulletsPerSlide) {
      errors.push(
        `Too many bullet points (${content.bullets.length}, max ${this.config.maxBulletsPerSlide})`,
      );
    }

    if (content.bullets) {
      content.bullets.forEach((bullet, idx) => {
        if (bullet.length > 3000) {
          warnings.push(
            `Bullet ${idx + 1} is very long (${bullet.length} chars), recommend keeping under 400 chars for slide readability`,
          );
        }
      });
    }

    // Total text length validation
    const totalText = [
      content.title || '',
      content.subtitle || '',
      ...(content.bullets || []),
    ].join(' ');

    if (totalText.length > this.config.maxTextLength) {
      errors.push(
        `Total text length exceeds ${this.config.maxTextLength} characters (got ${totalText.length})`,
      );
    }

    // Images validation
    if (content.visuals?.images && content.visuals.images.length > this.config.maxImages) {
      errors.push(
        `Too many images (${content.visuals.images.length}, max ${this.config.maxImages})`,
      );
    }

    // Layout-specific validation
    const layoutResult = this.validateLayout(content);
    errors.push(...layoutResult.errors);
    warnings.push(...layoutResult.warnings);

    const passed = errors.length === 0;

    log.info(passed ? `Slide ${slide.index} passed` : `Slide ${slide.index} failed`, {
      errors,
      warnings,
    });

    return { passed, errors, warnings };
  }

  private validateLayout(content: SlideContent): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    switch (content.layout) {
      case 'title':
        if (!content.title) {
          errors.push('Title slide requires a title');
        }
        break;

      case 'title-bullets':
        if (!content.bullets || content.bullets.length === 0) {
          warnings.push('Title-bullets layout should have at least one bullet point');
        }
        break;

      case 'two-column':
        // Two column layout is flexible
        break;

      case 'chart':
        if (!content.visuals?.chart) {
          errors.push('Chart layout requires chart data');
        }
        break;

      case 'quote':
        if (!content.title && !content.subtitle) {
          warnings.push('Quote layout typically has an attributed quote');
        }
        break;

      case 'table':
        if (!content.table && (!content.bullets || content.bullets.length === 0)) {
          warnings.push('Table layout should have either table data or bullets');
        }
        break;

      default:
        break;
    }

    return { errors, warnings };
  }

  async validateSlides(
    slides: Slide[],
  ): Promise<{ allPassed: boolean; results: SlideGuardrailResult[] }> {
    // Phase 12: Parallel validation
    const results = await Promise.all(slides.map((slide) => this.validateSlide(slide)));

    const allPassed = results.every((r) => r.passed);

    log.info(`Validated ${slides.length} slides`, {
      allPassed,
      failedCount: results.filter((r) => !r.passed).length,
    });

    return { allPassed, results };
  }
}
