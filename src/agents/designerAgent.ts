import { Slide, SlideContent, SlideLayout } from '../schemas/slide.schema';
import { ContentGenerator, SlidePlan } from '../harness/tools/contentGenerator';
import { ContextManager } from '../harness/context/contextManager';
import { SlideGuardrails } from '../harness/guardrails/slideGuardrails';
import { WorkingMemory } from '../harness/memory/workingMemory';
import { ConcurrencyPool, TaskResult } from '../utils/concurrency';
import { generateId } from '../utils/helpers';
import { logger } from '../utils/logger';

const log = logger.child('DesignerAgent');

export interface DesignerResult {
  success: boolean;
  slides: Slide[];
  errors: string[];
}

/** Default batch size for parallel slide generation */
const DEFAULT_BATCH_SIZE = 5;

export class DesignerAgent {
  private contentGenerator: ContentGenerator;
  private contextManager: ContextManager;
  private slideGuardrails: SlideGuardrails;
  private workingMemory: WorkingMemory;
  private batchSize: number;

  constructor(
    contentGenerator: ContentGenerator,
    contextManager: ContextManager,
    slideGuardrails: SlideGuardrails,
    workingMemory: WorkingMemory,
    options?: { batchSize?: number }
  ) {
    this.contentGenerator = contentGenerator;
    this.contextManager = contextManager;
    this.slideGuardrails = slideGuardrails;
    this.workingMemory = workingMemory;
    this.batchSize = options?.batchSize || DEFAULT_BATCH_SIZE;
  }

  /**
   * Design all slides using batch-parallel execution.
   * Each batch runs slides in parallel, context is updated between batches.
   */
  async designSlides(slidePlans: SlidePlan[]): Promise<DesignerResult> {
    log.info('Designing slides (parallel batches)...', {
      count: slidePlans.length,
      batchSize: this.batchSize,
    });

    const pool = new ConcurrencyPool({ concurrency: this.batchSize });
    const slides: Slide[] = new Array(slidePlans.length);
    const errors: string[] = [];
    let completed = 0;

    // Create tasks for all slides
    const tasks = slidePlans.map((plan, i) => async (): Promise<Slide> => {
      const previousSummaries = this.workingMemory.getContextWindow();
      const context = this.contextManager.buildDesignerContext(i, slidePlans.length, plan, previousSummaries);
      const content = await this.contentGenerator.generateSlideContent(context, plan);

      return {
        id: generateId(),
        index: i,
        content,
        isValid: false,
        validationErrors: [],
      };
    });

    // Run in ordered batches (context updates between batches)
    const results = await pool.runOrderedBatches(tasks, this.batchSize, (batchIndex, batchResults) => {
      // After each batch completes, update context with summaries
      for (const result of batchResults) {
        if (result.status === 'fulfilled' && result.value) {
          const slide = result.value;
          this.contextManager.addSlideSummary(`Slide ${slide.index + 1}: ${slide.content.title} (${slide.content.layout})`);
        }
      }
      log.info(`Batch ${batchIndex + 1} completed`, {
        succeeded: batchResults.filter(r => r.status === 'fulfilled').length,
        failed: batchResults.filter(r => r.status === 'rejected').length,
      });
    });

    // Process results in order
    for (const result of results) {
      const slideIndex = result.index;

      if (result.status === 'fulfilled' && result.value) {
        const slide = result.value;

        // Validate slide using guardrails
        const validation = await this.slideGuardrails.validateSlide(slide);
        slide.isValid = validation.passed;
        slide.validationErrors = validation.errors;

        if (!validation.passed) {
          errors.push(`Slide ${slideIndex + 1} validation failed: ${validation.errors.join('; ')}`);
        }

        slides[slideIndex] = slide;
        this.workingMemory.setCurrentSlideIndex(slideIndex);
      } else {
        // Fallback: create a basic slide with plan content
        const plan = slidePlans[slideIndex];
        log.warn(`Slide ${slideIndex + 1} generation failed, using fallback`, {
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });

        const fallbackSlide: Slide = {
          id: generateId(),
          index: slideIndex,
          content: {
            title: plan.title,
            subtitle: plan.subtitle || '',
            bullets: plan.bullets.length > 0 ? plan.bullets : ['Content placeholder'],
            notes: plan.notes,
            layout: plan.layout,
          },
          isValid: false,
          validationErrors: ['Generated with fallback due to LLM error'],
        };

        slides[slideIndex] = fallbackSlide;
        errors.push(`Slide ${slideIndex + 1} generation failed: ${result.reason}`);
      }
    }

    log.info('Design completed', {
      total: slides.length,
      valid: slides.filter(s => s.isValid).length,
      errors: errors.length,
    });

    return { success: errors.length === 0, slides, errors };
  }

  /**
   * Redesign only specific failed slides (for smart retry).
   * Keeps valid slides intact, only regenerates the ones at failedIndices.
   */
  async redesignSlides(
    slidePlans: SlidePlan[],
    failedIndices: number[],
    existingSlides: Slide[],
    feedback?: string[]
  ): Promise<DesignerResult> {
    log.info('Redesigning failed slides only...', {
      failedCount: failedIndices.length,
      totalCount: slidePlans.length,
    });

    const slides = [...existingSlides]; // Clone to keep valid ones intact
    const errors: string[] = [];

    // Create tasks only for failed slides
    const tasks = failedIndices.map((slideIndex) => async (): Promise<{ index: number; slide: Slide }> => {
      const plan = slidePlans[slideIndex];
      const previousSummaries = this.workingMemory.getContextWindow();
      const context = this.contextManager.buildDesignerContext(slideIndex, slidePlans.length, plan, previousSummaries);

      // Add feedback context for the retry
      const retryContext = feedback && feedback.length > 0
        ? `${context}\n\nPREVIOUS ERRORS TO FIX:\n${feedback.map(f => `- ${f}`).join('\n')}`
        : context;

      const content = await this.contentGenerator.generateSlideContent(retryContext, plan);

      const slide: Slide = {
        id: generateId(),
        index: slideIndex,
        content,
        isValid: false,
        validationErrors: [],
      };

      const validation = await this.slideGuardrails.validateSlide(slide);
      slide.isValid = validation.passed;
      slide.validationErrors = validation.errors;

      return { index: slideIndex, slide };
    });

    // Run redesign tasks in parallel (no batching needed, usually few slides)
    const pool = new ConcurrencyPool({ concurrency: this.batchSize });
    const results = await pool.runBatch(tasks);

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        const { index, slide } = result.value;
        slides[index] = slide;

        if (!slide.isValid) {
          errors.push(`Slide ${index + 1} still invalid after redesign: ${slide.validationErrors.join('; ')}`);
        }
      } else {
        const slideIndex = failedIndices[result.index];
        errors.push(`Slide ${slideIndex + 1} redesign failed: ${result.reason}`);
      }
    }

    log.info('Redesign completed', {
      total: failedIndices.length,
      succeeded: failedIndices.length - errors.length,
      failed: errors.length,
    });

    return { success: errors.length === 0, slides, errors };
  }
}
