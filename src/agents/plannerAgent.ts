import { ContentGenerator, SlidePlan } from '../harness/tools/contentGenerator';
import { ContextManager } from '../harness/context/contextManager';
import { InputGuardrails } from '../harness/guardrails/inputGuardrails';
import { WorkingMemory } from '../harness/memory/workingMemory';
import { logger } from '../utils/logger';

const log = logger.child('PlannerAgent');

export interface PlannerResult {
  success: boolean;
  slides: SlidePlan[];
  errors: string[];
}

export class PlannerAgent {
  private contentGenerator: ContentGenerator;
  private contextManager: ContextManager;
  private inputGuardrails: InputGuardrails;
  private workingMemory: WorkingMemory;

  constructor(
    contentGenerator: ContentGenerator,
    contextManager: ContextManager,
    inputGuardrails: InputGuardrails,
    workingMemory: WorkingMemory
  ) {
    this.contentGenerator = contentGenerator;
    this.contextManager = contextManager;
    this.inputGuardrails = inputGuardrails;
    this.workingMemory = workingMemory;
  }

  async plan(input: { topic: string; outline?: string[]; language?: string; maxSlides?: number }): Promise<PlannerResult> {
    log.info('Planning presentation...', { topic: input.topic });

    // Step 1: Validate input
    const validation = await this.inputGuardrails.validate(input.topic);
    if (!validation.passed) {
      return {
        success: false,
        slides: [],
        errors: validation.errors,
      };
    }

    // Step 2: Build context
    const context = this.contextManager.buildPlannerContext(input);

    // Step 3: Generate outline via LLM
    const outline = await this.contentGenerator.generateOutline(
      input.topic,
      input.outline,
      input.maxSlides
    );

    if (outline.length === 0) {
      return {
        success: false,
        slides: [],
        errors: ['Failed to generate outline from LLM'],
      };
    }

    // Step 4: Store in working memory
    this.workingMemory.setCurrentSlideIndex(0);

    log.info('Planning completed', { slideCount: outline.length });

    return {
      success: true,
      slides: outline,
      errors: [],
    };
  }
}