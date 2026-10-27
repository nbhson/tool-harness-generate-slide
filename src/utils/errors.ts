/**
 * Custom error classes for the Slide Harness application.
 * Provides better error handling and debugging.
 */

/**
 * Base error class for all Slide Harness errors.
 */
export class SlideHarnessError extends Error {
  public readonly code: string;
  public readonly statusCode?: number;
  public readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    options: {
      code?: string;
      statusCode?: number;
      context?: Record<string, unknown>;
      cause?: unknown;
    } = {},
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = options.code || 'SLIDE_HARNESS_ERROR';
    this.statusCode = options.statusCode;
    this.context = options.context;
    this.cause = options.cause;

    // Maintains proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      context: this.context,
      stack: this.stack,
      cause: this.cause instanceof Error ? this.cause.message : this.cause,
    };
  }
}

/**
 * Error thrown when LLM API calls fail.
 */
export class LLMError extends SlideHarnessError {
  constructor(
    message: string,
    options: {
      model?: string;
      statusCode?: number;
      cause?: unknown;
    } = {},
  ) {
    super(message, {
      code: 'LLM_ERROR',
      statusCode: options.statusCode,
      context: { model: options.model },
      cause: options.cause,
    });
  }
}

/**
 * Error thrown when LLM API connection fails.
 */
export class LLMConnectionError extends LLMError {
  constructor(url: string, cause?: unknown) {
    super(`Cannot connect to LLM at ${url}`, {
      statusCode: 0,
      cause,
    });
  }
}

/**
 * Error thrown when circuit breaker is open and fallback fails.
 */
export class LLMUnavailableError extends LLMError {
  constructor(attempts: number, cause?: unknown) {
    const msg = `LLM unavailable after ${attempts} fallback attempts`;
    super(msg, {
      statusCode: 503,
      cause,
    });
  }
}

/**
 * Error thrown when content generation fails.
 */
export class ContentGenerationError extends SlideHarnessError {
  constructor(slideTitle: string, cause?: unknown) {
    super(`Failed to generate content for slide: ${slideTitle}`, {
      code: 'CONTENT_GENERATION_ERROR',
      context: { slideTitle },
      cause,
    });
  }
}

/**
 * Error thrown when slide validation fails.
 */
export class ValidationError extends SlideHarnessError {
  public readonly validationErrors: string[];

  constructor(message: string, validationErrors: string[] = []) {
    super(message, {
      code: 'VALIDATION_ERROR',
    });
    this.validationErrors = validationErrors;
  }
}

/**
 * Error thrown when slide export fails.
 */
export class ExportError extends SlideHarnessError {
  constructor(
    message: string,
    options: {
      outputPath?: string;
      cause?: unknown;
    } = {},
  ) {
    super(message, {
      code: 'EXPORT_ERROR',
      context: { outputPath: options.outputPath },
      cause: options.cause,
    });
  }
}

/**
 * Error thrown when theme is not found or invalid.
 */
export class ThemeError extends SlideHarnessError {
  constructor(themeName: string, availableThemes?: string[]) {
    super(`Theme "${themeName}" not found`, {
      code: 'THEME_ERROR',
      context: {
        requestedTheme: themeName,
        availableThemes,
      },
    });
  }
}

/**
 * Error thrown when input validation fails.
 */
export class InputValidationError extends ValidationError {
  constructor(field: string, message: string) {
    super(`Invalid input for "${field}": ${message}`, [message]);
  }
}

/**
 * Error thrown when planning fails.
 */
export class PlanningError extends SlideHarnessError {
  constructor(message: string, errors: string[] = []) {
    super(message, {
      code: 'PLANNING_ERROR',
      context: { errors },
    });
  }
}

/**
 * Error thrown when design fails.
 */
export class DesignError extends SlideHarnessError {
  constructor(
    message: string,
    options: {
      slideIndex?: number;
      errors?: string[];
      cause?: unknown;
    } = {},
  ) {
    super(message, {
      code: 'DESIGN_ERROR',
      context: {
        slideIndex: options.slideIndex,
        errors: options.errors,
      },
      cause: options.cause,
    });
  }
}

/**
 * Error thrown when evaluation fails.
 */
export class EvaluationError extends SlideHarnessError {
  constructor(
    message: string,
    options: {
      attempt?: number;
      failedSlides?: number[];
      errors?: string[];
    } = {},
  ) {
    super(message, {
      code: 'EVALUATION_ERROR',
      context: {
        attempt: options.attempt,
        failedSlides: options.failedSlides,
        errors: options.errors,
      },
    });
  }
}

/**
 * Helper to check if an error is a SlideHarnessError
 */
export function isSlideHarnessError(error: unknown): error is SlideHarnessError {
  return error instanceof SlideHarnessError;
}

/**
 * Helper to get user-friendly error message
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof SlideHarnessError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Helper to format error for logging
 */
export function formatError(error: unknown): string {
  if (error instanceof SlideHarnessError) {
    return `[${error.code}] ${error.message}${error.context ? ` (${JSON.stringify(error.context)})` : ''}`;
  }
  if (error instanceof Error) {
    return `[${error.name}] ${error.message}`;
  }
  return `[Unknown] ${String(error)}`;
}
