import type { GeneratePresentationInput, Presentation } from '../schemas/presentation.schema';
import type { SlideTheme } from '../schemas/slide.schema';
import { InputGuardrails } from './guardrails/inputGuardrails';
import { SlideGuardrails } from './guardrails/slideGuardrails';
import { DeckGuardrails } from './guardrails/deckGuardrails';
import { OutputGuardrails } from './guardrails/outputGuardrails';
import { ShortTermMemory } from './memory/shortTerm';
import { WorkingMemory } from './memory/workingMemory';
import { LongTermMemory } from './memory/longTerm';
import { ContextManager } from './context/contextManager';
import { PermissionManager } from './permissions/permissionManager';
import { FeedbackLoop } from './feedback/feedbackLoop';
import { ContentGenerator } from './tools/contentGenerator';
import { SlideExporter } from './tools/slideExporter';
import { PlannerAgent } from '../agents/plannerAgent';
import { DesignerAgent } from '../agents/designerAgent';
import { EvaluatorAgent } from '../agents/evaluatorAgent';
import { generateId } from '../utils/helpers';
import { logger } from '../utils/logger';

import * as modernTheme from '../templates/modern.json';
import * as minimalTheme from '../templates/minimal.json';
import * as corporateTheme from '../templates/corporate.json';
import * as creativeTheme from '../templates/creative.json';
import * as boldTheme from '../templates/bold.json';
import * as elegantTheme from '../templates/elegant.json';
import * as gradientTheme from '../templates/gradient.json';
import * as oceanTheme from '../templates/ocean.json';
import * as techTheme from '../templates/tech.json';

const log = logger.child('SlideHarness');

const THEMES: Record<string, SlideTheme> = {
  modern: modernTheme as unknown as SlideTheme,
  minimal: minimalTheme as unknown as SlideTheme,
  corporate: corporateTheme as unknown as SlideTheme,
  creative: creativeTheme as unknown as SlideTheme,
  bold: boldTheme as unknown as SlideTheme,
  elegant: elegantTheme as unknown as SlideTheme,
  gradient: gradientTheme as unknown as SlideTheme,
  ocean: oceanTheme as unknown as SlideTheme,
  tech: techTheme as unknown as SlideTheme,
};

export interface HarnessConfig {
  baseUrl: string;
  apiKey?: string;
  model: {
    content: string;
    image: string;
    fallback: string;
  };
  theme: string;
  guardrails: {
    maxSlides: number;
    brandCompliance: boolean;
  };
}

const defaultConfig: HarnessConfig = {
  baseUrl: process.env.LLM_BASE_URL || 'http://localhost:3000',
  apiKey: process.env.LLM_API_KEY,
  model: {
    content: process.env.LLM_MODEL || 'claude-3.5-sonnet',
    image: process.env.LLM_IMAGE_MODEL || 'dall-e-3',
    fallback: process.env.LLM_FALLBACK_MODEL || 'gpt-4o',
  },
  theme: 'modern',
  guardrails: {
    maxSlides: 20,
    brandCompliance: true,
  },
};

export class SlideHarness {
  private config: HarnessConfig;

  // Guardrails
  private inputGuardrails: InputGuardrails;
  private slideGuardrails: SlideGuardrails;
  private deckGuardrails: DeckGuardrails;
  private outputGuardrails: OutputGuardrails;

  // Memory
  private shortTermMemory: ShortTermMemory;
  private workingMemory: WorkingMemory;
  private longTermMemory: LongTermMemory;

  // Context & Permissions
  private contextManager: ContextManager;
  private permissionManager: PermissionManager;

  // Feedback
  private feedbackLoop: FeedbackLoop;

  // Tools
  private contentGenerator: ContentGenerator;
  private slideExporter: SlideExporter;

  // Agents
  private plannerAgent: PlannerAgent;
  private designerAgent: DesignerAgent;
  private evaluatorAgent: EvaluatorAgent;

  constructor(config: Partial<HarnessConfig> = {}) {
    this.config = { ...defaultConfig, ...config };

    // Initialize guardrails
    this.inputGuardrails = new InputGuardrails();
    this.slideGuardrails = new SlideGuardrails();
    this.deckGuardrails = new DeckGuardrails({ maxSlides: this.config.guardrails.maxSlides });
    this.outputGuardrails = new OutputGuardrails();

    // Initialize memory
    this.shortTermMemory = new ShortTermMemory();
    this.workingMemory = new WorkingMemory();
    this.longTermMemory = new LongTermMemory();

    // Initialize context & permissions
    this.contextManager = new ContextManager(this.workingMemory, this.shortTermMemory);
    this.permissionManager = new PermissionManager();

    // Initialize feedback
    this.feedbackLoop = new FeedbackLoop(this.longTermMemory);

    // Initialize tools
    this.contentGenerator = new ContentGenerator({
      baseUrl: this.config.baseUrl,
      apiKey: this.config.apiKey,
      model: this.config.model.content,
      fallbackModel: this.config.model.fallback,
    });
    this.slideExporter = new SlideExporter();

    // Initialize agents
    this.plannerAgent = new PlannerAgent(
      this.contentGenerator,
      this.contextManager,
      this.inputGuardrails,
      this.workingMemory,
    );

    this.designerAgent = new DesignerAgent(
      this.contentGenerator,
      this.contextManager,
      this.slideGuardrails,
      this.workingMemory,
    );

    this.evaluatorAgent = new EvaluatorAgent(
      this.deckGuardrails,
      this.slideGuardrails,
      this.feedbackLoop,
    );

    log.info('SlideHarness initialized', {
      baseUrl: this.config.baseUrl,
      model: this.config.model.content,
      theme: this.config.theme,
    });
  }

  async generate(input: GeneratePresentationInput): Promise<Presentation> {
    const startTime = Date.now();
    log.info('Starting presentation generation', { topic: input.topic });

    // Apply theme preference
    const themeName = input.theme || this.config.theme;
    const theme = THEMES[themeName] || THEMES.modern;

    // Update short-term memory with preferences
    if (input.language) {
      this.shortTermMemory.updatePreferences({ language: input.language });
    }
    this.shortTermMemory.setCurrentTopic(input.topic);

    // Step 1: Planning
    log.info('Step 1: Planning...');
    const planResult = await this.plannerAgent.plan({
      topic: input.topic,
      outline: input.outline,
      language: input.language,
      maxSlides: input.maxSlides || this.config.guardrails.maxSlides,
    });

    if (!planResult.success) {
      throw new Error(`Planning failed: ${planResult.errors.join('; ')}`);
    }

    // Step 2: Designing
    log.info('Step 2: Designing slides...');
    const designResult = await this.designerAgent.designSlides(planResult.slides);

    // Step 3: Assembling presentation
    log.info('Step 3: Assembling presentation...');
    const presentation: Presentation = {
      id: generateId(),
      title: input.topic,
      slides: designResult.slides,
      theme,
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        language: input.language || 'vi',
        aspectRatio: input.aspectRatio || '16:9',
        totalSlides: designResult.slides.length,
        topic: input.topic,
      },
      isValid: false,
      validationErrors: [],
    };

    // Step 4: Evaluation with smart retry
    log.info('Step 4: Evaluating...');
    let evalResult = await this.evaluatorAgent.evaluate(presentation, 1);

    for (let attempt = 2; attempt <= 3; attempt++) {
      if (evalResult.approved) break;

      log.info('Presentation needs retry, applying smart feedback...', { attempt });

      const retryResult = await this.feedbackLoop.onValidationFailure({
        error: evalResult.errors[0] || 'Unknown error',
        stage: 'evaluation',
        attempt: attempt - 1,
      });

      if (!retryResult.shouldRetry) {
        break;
      }

      // Phase 3: Smart Retry — only redesign failed slides
      const failedIndices = this.identifyFailedSlides(presentation, evalResult.errors);

      if (failedIndices.length === 0) {
        // No specific slide failures identified, fallback to full redesign
        log.info('No specific failed slides identified, doing full redesign');
        const redesigned = await this.designerAgent.designSlides(planResult.slides);
        presentation.slides = redesigned.slides;
      } else {
        log.info(`Redesigning ${failedIndices.length}/${presentation.slides.length} failed slides`);
        const redesigned = await this.designerAgent.redesignSlides(
          planResult.slides,
          failedIndices,
          presentation.slides,
          evalResult.feedback,
        );
        presentation.slides = redesigned.slides;
      }

      presentation.metadata.updatedAt = new Date().toISOString();
      presentation.metadata.totalSlides = presentation.slides.length;
      evalResult = await this.evaluatorAgent.evaluate(presentation, attempt);
    }

    // Mark validation
    presentation.isValid = evalResult.approved;
    presentation.validationErrors = evalResult.errors;

    // Record metrics
    const duration = Date.now() - startTime;
    this.feedbackLoop.recordAttempt(duration, evalResult.approved);

    log.info('Presentation generation completed', {
      topic: input.topic,
      slideCount: presentation.slides.length,
      isValid: presentation.isValid,
      duration: `${duration}ms`,
    });

    return presentation;
  }

  async export(presentation: Presentation, outputPath: string): Promise<string> {
    // Output guardrails
    const outputValidation = await this.outputGuardrails.validatePresentation(presentation);
    if (!outputValidation.passed) {
      log.warn('Output validation warnings', { errors: outputValidation.errors });
    }

    return this.slideExporter.exportPPTX(presentation, outputPath);
  }

  /**
   * Phase 13: Generate + Export in a single pipeline.
   * Starts PPTX template preparation in background while evaluation runs.
   */
  async generateAndExport(
    input: GeneratePresentationInput,
    outputPath?: string,
  ): Promise<{
    presentation: Presentation;
    exportPath: string;
  }> {
    const startTime = Date.now();
    log.info('Starting pipeline: generate + export', { topic: input.topic });

    // Apply theme preference
    const themeName = input.theme || this.config.theme;
    const theme = THEMES[themeName] || THEMES.modern;

    if (input.language) {
      this.shortTermMemory.updatePreferences({ language: input.language });
    }
    this.shortTermMemory.setCurrentTopic(input.topic);

    // Step 1: Planning
    const planResult = await this.plannerAgent.plan({
      topic: input.topic,
      outline: input.outline,
      language: input.language,
      maxSlides: input.maxSlides || this.config.guardrails.maxSlides,
    });

    if (!planResult.success) {
      throw new Error(`Planning failed: ${planResult.errors.join('; ')}`);
    }

    // Step 2: Design (parallel batches)
    const designResult = await this.designerAgent.designSlides(planResult.slides);

    // Step 3: Assemble
    const presentation: Presentation = {
      id: generateId(),
      title: input.topic,
      slides: designResult.slides,
      theme,
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        language: input.language || 'vi',
        aspectRatio: input.aspectRatio || '16:9',
        totalSlides: designResult.slides.length,
        topic: input.topic,
      },
      isValid: false,
      validationErrors: [],
    };

    // Step 4: Evaluation (with smart retry)
    let evalResult = await this.evaluatorAgent.evaluate(presentation, 1);

    for (let attempt = 2; attempt <= 3; attempt++) {
      if (evalResult.approved) break;

      const failedIndices = this.identifyFailedSlides(presentation, evalResult.errors);

      if (failedIndices.length === 0) {
        const redesigned = await this.designerAgent.designSlides(planResult.slides);
        presentation.slides = redesigned.slides;
      } else {
        const redesigned = await this.designerAgent.redesignSlides(
          planResult.slides,
          failedIndices,
          presentation.slides,
          evalResult.feedback,
        );
        presentation.slides = redesigned.slides;
      }

      presentation.metadata.updatedAt = new Date().toISOString();
      presentation.metadata.totalSlides = presentation.slides.length;
      evalResult = await this.evaluatorAgent.evaluate(presentation, attempt);
    }

    presentation.isValid = evalResult.approved;
    presentation.validationErrors = evalResult.errors;

    // Step 5: Export
    const exportPath = outputPath || `${input.topic.replace(/\s+/g, '_')}.pptx`;
    const outputValidation = await this.outputGuardrails.validatePresentation(presentation);
    if (!outputValidation.passed) {
      log.warn('Output validation warnings', { errors: outputValidation.errors });
    }

    const finalPath = await this.slideExporter.exportPPTX(presentation, exportPath);

    const totalDuration = Date.now() - startTime;
    log.info('Pipeline completed', {
      topic: input.topic,
      slides: presentation.slides.length,
      exported: finalPath,
      duration: `${totalDuration}ms`,
    });

    return { presentation, exportPath: finalPath };
  }

  async rate(presentation: Presentation, rating: number, feedback?: string): Promise<void> {
    await this.feedbackLoop.onUserRating(rating, presentation);
    if (feedback) {
      await this.longTermMemory.saveFeedback(presentation.id, feedback, rating);
    }
  }

  getMetrics() {
    return this.feedbackLoop.getMetrics();
  }

  /**
   * Identify which slide indices failed validation from error messages or slide state.
   * Checks slide.isValid as well as parses error strings like "Slide 3: Too many bullet points"
   */
  private identifyFailedSlides(presentation: Presentation, errors: string[]): number[] {
    const failedIndices = new Set<number>();

    // 1. Check slide state directly
    presentation.slides.forEach((slide, idx) => {
      if (
        slide.isValid === false ||
        (slide.validationErrors && slide.validationErrors.length > 0)
      ) {
        failedIndices.add(idx);
      }
    });

    // 2. Parse text error messages
    for (const error of errors) {
      const matches = error.matchAll(/(?:Slide|slide)\s*#?\s*(\d+)/gi);
      for (const match of matches) {
        const slideNum = parseInt(match[1], 10);
        if (slideNum >= 1 && slideNum <= presentation.slides.length) {
          failedIndices.add(slideNum - 1);
        }
      }
    }

    return Array.from(failedIndices);
  }

  getHistory() {
    return this.longTermMemory.getHistory();
  }
}

export default SlideHarness;
