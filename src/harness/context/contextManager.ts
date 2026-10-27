import type { Slide } from '../../schemas/slide.schema';
import type { WorkingMemory } from '../memory/workingMemory';
import type { ShortTermMemory } from '../memory/shortTerm';
import { logger } from '../../utils/logger';

export interface ContextPayload {
  topic: string;
  outline?: string[];
  currentSlideIndex: number;
  totalSlides: number;
  generatedSlidesSummary: string[];
  theme: string;
  language: string;
  additionalContext?: string;
}

const log = logger.child('ContextManager');

export class ContextManager {
  private workingMemory: WorkingMemory;
  private shortTermMemory: ShortTermMemory;

  constructor(workingMemory: WorkingMemory, shortTermMemory: ShortTermMemory) {
    this.workingMemory = workingMemory;
    this.shortTermMemory = shortTermMemory;
  }

  buildPlannerContext(input: {
    topic: string;
    outline?: string[];
    language?: string;
    maxSlides?: number;
  }): string {
    const sections: string[] = [];

    sections.push('=== PRESENTATION PLANNING CONTEXT ===');
    sections.push(`Topic: ${input.topic}`);
    sections.push(`Language: ${input.language || 'vi'}`);
    sections.push(`Max slides: ${input.maxSlides || 20}`);

    if (input.outline && input.outline.length > 0) {
      sections.push(`\nUser-provided outline:`);
      input.outline.forEach((item, i) => {
        sections.push(`  ${i + 1}. ${item}`);
      });
    }

    const prefs = this.shortTermMemory.getPreferences();
    sections.push(`\nAvailable layouts: ${prefs.layouts.join(', ')}`);
    sections.push(`Available themes: ${prefs.themes.join(', ')}`);

    log.debug('Built planner context', { length: sections.join('\n').length });
    return sections.join('\n');
  }

  buildDesignerContext(
    slideIndex: number,
    totalSlides: number,
    slidePlan: { title: string; layout: string; bullets?: string[] },
    previousSlidesSummary: string[],
  ): string {
    const sections: string[] = [];

    sections.push('=== SLIDE DESIGN CONTEXT ===');
    sections.push(`Slide ${slideIndex + 1} of ${totalSlides}`);
    sections.push(`Title: ${slidePlan.title}`);
    sections.push(`Layout: ${slidePlan.layout}`);

    if (slidePlan.bullets && slidePlan.bullets.length > 0) {
      sections.push(`Key points: ${slidePlan.bullets.join('; ')}`);
    }

    if (previousSlidesSummary.length > 0) {
      sections.push(`\nPrevious slides context:`);
      previousSlidesSummary.forEach((summary) => {
        sections.push(`  - ${summary}`);
      });
    }

    const prefs = this.shortTermMemory.getPreferences();
    sections.push(`\nLanguage: ${prefs.language}`);
    sections.push(`Available layouts: ${prefs.layouts.join(', ')}`);
    sections.push(`Style: Modern, clean, professional`);
    sections.push(`Max bullets per slide: 7`);
    sections.push(`Min font size: 18px`);

    log.debug('Built designer context', { slideIndex, length: sections.join('\n').length });
    return sections.join('\n');
  }

  buildEvaluatorContext(slides: Slide[]): string {
    const sections: string[] = [];

    sections.push('=== SLIDE EVALUATION CONTEXT ===');
    sections.push(`Total slides: ${slides.length}`);
    sections.push('\nSlides:');

    for (const slide of slides) {
      sections.push(`\n--- Slide ${slide.index + 1}: ${slide.content.title} ---`);
      sections.push(`Layout: ${slide.content.layout}`);
      sections.push(`Bullets: ${(slide.content.bullets || []).length}`);
      sections.push(`Text length: ${JSON.stringify(slide.content).length} chars`);
      sections.push(`Valid: ${slide.isValid}`);
      if (slide.validationErrors.length > 0) {
        sections.push(`Errors: ${slide.validationErrors.join('; ')}`);
      }
    }

    log.debug('Built evaluator context', { slideCount: slides.length });
    return sections.join('\n');
  }

  addSlideSummary(summary: string): void {
    this.workingMemory.addToContextWindow(summary);
  }

  getSlideSummaries(): string[] {
    return this.workingMemory.getContextWindow();
  }
}
