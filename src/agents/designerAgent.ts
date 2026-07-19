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
  async designSlides(
    slidePlans: SlidePlan[],
    onProgress?: (completed: number, total: number) => void
  ): Promise<DesignerResult> {
    log.info('Designing slides (parallel batches)...', {
      count: slidePlans.length,
      batchSize: this.batchSize,
    });

    const slides: Slide[] = new Array(slidePlans.length);
    const errors: string[] = [];

    // Run in ordered batches (each batch runs in parallel, batches sequentially)
    const batches = this.chunkArray(slidePlans, this.batchSize);

    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      const batch = batches[batchIdx];
      const globalOffset = batchIdx * this.batchSize;

      // Each task captures the GLOBAL index
      const tasks = batch.map((plan, localIdx) => async (): Promise<{ globalIndex: number; slide: Slide }> => {
        const globalIndex = globalOffset + localIdx;
        const previousSummaries = this.workingMemory.getContextWindow();
        const context = this.contextManager.buildDesignerContext(globalIndex, slidePlans.length, plan, previousSummaries);
        const content = await this.contentGenerator.generateSlideContent(context, plan);

        const slide: Slide = {
          id: generateId(),
          index: globalIndex,
          content,
          isValid: false,
          validationErrors: [],
        };

        return { globalIndex, slide };
      });

      // Run batch in parallel
      const pool = new ConcurrencyPool({ concurrency: this.batchSize, adaptive: true });
      const batchResults = await pool.runBatch(tasks, (batchCompleted) => {
        if (onProgress) {
          onProgress(globalOffset + batchCompleted, slidePlans.length);
        }
      });

      // Process batch results with correct global indices
      for (const result of batchResults) {
        if (result.status === 'fulfilled' && result.value) {
          const { globalIndex, slide } = result.value;

          // Validate slide
          const validation = await this.slideGuardrails.validateSlide(slide);
          slide.isValid = validation.passed;
          slide.validationErrors = validation.errors;

          if (!validation.passed) {
            errors.push(`Slide ${globalIndex + 1} validation failed: ${validation.errors.join('; ')}`);
          }

          slides[globalIndex] = slide;
          this.contextManager.addSlideSummary(`Slide ${globalIndex + 1}: ${slide.content.title} (${slide.content.layout})`);
          this.workingMemory.setCurrentSlideIndex(globalIndex);
        } else {
          // Fallback slide
          const globalIndex = globalOffset + batchResults.indexOf(result);
          const plan = slidePlans[globalIndex];

          const fallbackSlide: Slide = {
            id: generateId(),
            index: globalIndex,
            content: {
              title: plan.title,
              subtitle: plan.subtitle || '',
              bullets: plan.bullets.length > 0 ? plan.bullets : [
                `**Tổng quan**: Phân tích thông tin chi tiết về ${plan.title}`,
                '**Giải pháp**: Tối ưu hóa và nâng cao hiệu quả triển khai',
              ],
              notes: plan.notes,
              layout: plan.layout,
            },
            isValid: false,
            validationErrors: ['Generated with fallback due to LLM error'],
          };

          slides[globalIndex] = fallbackSlide;
          errors.push(`Slide ${globalIndex + 1} generation failed: ${result.reason}`);
        }
      }

      log.info(`Batch ${batchIdx + 1}/${batches.length} completed`, {
        succeeded: batchResults.filter(r => r.status === 'fulfilled').length,
        failed: batchResults.filter(r => r.status === 'rejected').length,
      });
    }

    log.info('Design completed', {
      total: slides.length,
      valid: slides.filter(s => s.isValid).length,
      errors: errors.length,
    });

    return { success: errors.length === 0, slides, errors };
  }

  /**
   * Split array into chunks
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Redesign only specific failed slides (for smart retry).
   * Keeps valid slides intact, only regenerates the ones at failedIndices.
   */
  async redesignSlides(
    slidePlans: SlidePlan[],
    failedIndices: number[],
    existingSlides: Slide[],
    feedback?: string[],
    onProgress?: (completed: number, total: number) => void
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
    const pool = new ConcurrencyPool({ concurrency: this.batchSize, adaptive: true });
    const results = await pool.runBatch(tasks, (completed, total) => {
      if (onProgress) onProgress(completed, total);
    });

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
