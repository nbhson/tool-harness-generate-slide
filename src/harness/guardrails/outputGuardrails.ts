import { Presentation } from '../../schemas/presentation.schema';
import { logger } from '../../utils/logger';

export interface OutputGuardrailResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
}

export interface OutputGuardrailConfig {
  validatePPTX: boolean;
  validatePDF: boolean;
  checkImageResolution: boolean;
  checkAspectRatio: boolean;
  defaultAspectRatio: '16:9' | '4:3';
  minDPI: number;
}

const defaultConfig: OutputGuardrailConfig = {
  validatePPTX: true,
  validatePDF: true,
  checkImageResolution: true,
  checkAspectRatio: true,
  defaultAspectRatio: '16:9',
  minDPI: 150,
};

const log = logger.child('OutputGuardrails');

export class OutputGuardrails {
  private config: OutputGuardrailConfig;

  constructor(config: Partial<OutputGuardrailConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
  }

  async validatePresentation(presentation: Presentation): Promise<OutputGuardrailResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    log.info('Running output validation...');

    // Metadata validation
    if (!presentation.metadata) {
      errors.push('Presentation metadata is missing');
    } else {
      if (!presentation.metadata.topic) {
        warnings.push('Metadata is missing topic information');
      }
      if (!presentation.metadata.createdAt) {
        warnings.push('Metadata is missing creation date');
      }
    }

    // Theme validation
    if (!presentation.theme) {
      errors.push('Presentation theme is missing');
    } else {
      const themeResult = this.validateTheme(presentation);
      errors.push(...themeResult.errors);
      warnings.push(...themeResult.warnings);
    }

    // Aspect ratio check
    if (this.config.checkAspectRatio && presentation.metadata) {
      const ratio = presentation.metadata.aspectRatio || this.config.defaultAspectRatio;
      if (!['16:9', '4:3'].includes(ratio)) {
        errors.push(`Invalid aspect ratio: ${ratio}. Must be 16:9 or 4:3`);
      }
    }

    // Check slides have required content
    for (const slide of presentation.slides) {
      if (!slide.content || !slide.content.layout) {
        errors.push(`Slide ${slide.index} is missing content layout`);
      }
    }

    const passed = errors.length === 0;

    log.info(passed ? 'Output validation passed' : 'Output validation failed', {
      errors,
      warnings,
    });

    return { passed, errors, warnings };
  }

  private validateTheme(presentation: Presentation): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];
    const theme = presentation.theme;

    if (!theme.colors) {
      errors.push('Theme is missing color definitions');
    } else {
      if (!theme.colors.primary) warnings.push('Theme is missing primary color');
      if (!theme.colors.background) warnings.push('Theme is missing background color');
      if (!theme.colors.text) warnings.push('Theme is missing text color');
    }

    if (!theme.fonts) {
      warnings.push('Theme is missing font definitions');
    }

    return { errors, warnings };
  }
}