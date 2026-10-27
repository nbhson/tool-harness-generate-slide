import { logger } from '../../utils/logger';

export interface InputGuardrailResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
}

export interface InputGuardrailConfig {
  contentModeration: boolean;
  topicValidation: boolean;
  maxLength: number;
  minLength: number;
  blockedTopics: string[];
}

const defaultConfig: InputGuardrailConfig = {
  contentModeration: true,
  topicValidation: true,
  maxLength: 100000, // Cho phép input dài (bài viết, markdown file)
  minLength: 5,
  blockedTopics: [],
};

const log = logger.child('InputGuardrails');

export class InputGuardrails {
  private config: InputGuardrailConfig;

  constructor(config: Partial<InputGuardrailConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
  }

  async validate(input: string): Promise<InputGuardrailResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    log.info('Validating input...', { length: input.length });

    // Length validation - soft limit: warn but don't block
    if (input.length > this.config.maxLength) {
      warnings.push(
        `Input is very long (${input.length} chars). Content will be truncated to fit LLM context window.`,
      );
    }

    if (input.length < this.config.minLength) {
      errors.push(
        `Input is too short. Minimum ${this.config.minLength} characters required (got ${input.length})`,
      );
    }

    // Content moderation
    if (this.config.contentModeration) {
      const moderationResult = this.moderateContent(input);
      if (!moderationResult.passed) {
        errors.push(...moderationResult.errors);
      }
      warnings.push(...moderationResult.warnings);
    }

    // Topic validation
    if (this.config.topicValidation) {
      const topicResult = this.validateTopic(input);
      if (!topicResult.passed) {
        errors.push(...topicResult.errors);
      }
      warnings.push(...topicResult.warnings);
    }

    const passed = errors.length === 0;

    log.info(passed ? 'Input validation passed' : 'Input validation failed', { errors, warnings });

    return { passed, errors, warnings };
  }

  private moderateContent(input: string): {
    passed: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for blocked topics
    const lowerInput = input.toLowerCase();
    for (const topic of this.config.blockedTopics) {
      if (lowerInput.includes(topic.toLowerCase())) {
        errors.push(`Content contains blocked topic: "${topic}"`);
      }
    }

    // Check for potentially harmful content patterns
    const harmfulPatterns = [
      /\b(hack|exploit|malware|phishing)\b/i,
      /\b(hate\s+speech|harassment|bullying)\b/i,
    ];

    for (const pattern of harmfulPatterns) {
      if (pattern.test(input)) {
        warnings.push(`Content may contain sensitive material matching pattern: ${pattern.source}`);
      }
    }

    return { passed: errors.length === 0, errors, warnings };
  }

  private validateTopic(input: string): { passed: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if input is meaningful (not just random characters)
    const meaningfulWords = input.split(/\s+/).filter((word) => word.length > 2);
    if (meaningfulWords.length < 2) {
      warnings.push('Input may not contain enough meaningful content for presentation');
    }

    return { passed: errors.length === 0, errors, warnings };
  }
}
