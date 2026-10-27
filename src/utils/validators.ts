/**
 * Input validation helpers for CLI options and pptxgenjs options.
 */

/**
 * Available slide themes.
 */
export const AVAILABLE_THEMES = [
  'modern',
  'minimal',
  'corporate',
  'creative',
  'bold',
  'elegant',
  'gradient',
  'ocean',
  'tech',
] as const;

export type ThemeName = (typeof AVAILABLE_THEMES)[number];

/**
 * Supported languages.
 */
export const AVAILABLE_LANGUAGES = ['vi', 'en', 'ja', 'ko'] as const;

export type LanguageCode = (typeof AVAILABLE_LANGUAGES)[number];

/**
 * Supported aspect ratios.
 */
export const AVAILABLE_ASPECT_RATIOS = ['16:9', '4:3'] as const;

export type AspectRatio = (typeof AVAILABLE_ASPECT_RATIOS)[number];

/**
 * Validation error with helpful message.
 */
export class OptionValidationError extends Error {
  constructor(
    message: string,
    public readonly option: string,
    public readonly received?: unknown,
    public readonly expected?: string,
  ) {
    super(message);
    this.name = 'OptionValidationError';
  }
}

/**
 * Validate theme name.
 * @throws {OptionValidationError} if theme is invalid
 */
export function validateTheme(theme: string): ThemeName {
  if (!AVAILABLE_THEMES.includes(theme as ThemeName)) {
    throw new OptionValidationError(
      `Invalid theme "${theme}". Available themes: ${AVAILABLE_THEMES.join(', ')}`,
      '--theme',
      theme,
      AVAILABLE_THEMES.join(' | '),
    );
  }
  return theme as ThemeName;
}

/**
 * Validate language code.
 * @throws {OptionValidationError} if language is invalid
 */
export function validateLanguage(language: string): LanguageCode {
  if (!AVAILABLE_LANGUAGES.includes(language as LanguageCode)) {
    throw new OptionValidationError(
      `Invalid language "${language}". Available languages: ${AVAILABLE_LANGUAGES.join(', ')}`,
      '--language',
      language,
      AVAILABLE_LANGUAGES.join(' | '),
    );
  }
  return language as LanguageCode;
}

/**
 * Validate aspect ratio.
 * @throws {OptionValidationError} if aspect ratio is invalid
 */
export function validateAspectRatio(ratio: string): AspectRatio {
  if (!AVAILABLE_ASPECT_RATIOS.includes(ratio as AspectRatio)) {
    throw new OptionValidationError(
      `Invalid aspect ratio "${ratio}". Available ratios: ${AVAILABLE_ASPECT_RATIOS.join(', ')}`,
      '--aspect-ratio',
      ratio,
      AVAILABLE_ASPECT_RATIOS.join(' | '),
    );
  }
  return ratio as AspectRatio;
}

/**
 * Validate max slides (1-50).
 * @throws {OptionValidationError} if max slides is invalid
 */
export function validateMaxSlides(maxSlides: number | string): number {
  const num = typeof maxSlides === 'string' ? parseInt(maxSlides, 10) : maxSlides;

  if (Number.isNaN(num)) {
    throw new OptionValidationError(
      `Invalid max slides "${maxSlides}". Must be a number.`,
      '--max-slides',
      maxSlides,
      '1-50',
    );
  }

  if (num < 1 || num > 50) {
    throw new OptionValidationError(
      `Invalid max slides "${num}". Must be between 1 and 50.`,
      '--max-slides',
      num,
      '1-50',
    );
  }

  return num;
}

/**
 * Validate output path (.pptx extension).
 * @throws {OptionValidationError} if output path is invalid
 */
export function validateOutputPath(outputPath: string): string {
  if (!outputPath || typeof outputPath !== 'string') {
    throw new OptionValidationError(
      'Output path must be a non-empty string',
      '--output',
      outputPath,
    );
  }

  if (!outputPath.toLowerCase().endsWith('.pptx')) {
    throw new OptionValidationError(
      `Output path must end with .pptx extension. Received: "${outputPath}"`,
      '--output',
      outputPath,
      '*.pptx',
    );
  }

  return outputPath;
}

/**
 * Validate topic input.
 * @throws {OptionValidationError} if topic is invalid
 */
export function validateTopic(topic: string): string {
  if (!topic || typeof topic !== 'string') {
    throw new OptionValidationError('Topic must be a non-empty string', '--input', topic);
  }

  const trimmed = topic.trim();
  if (trimmed.length === 0) {
    throw new OptionValidationError('Topic cannot be empty', '--input', topic);
  }

  if (trimmed.length < 3) {
    throw new OptionValidationError(
      `Topic too short (min 3 characters). Received: "${trimmed}"`,
      '--input',
      trimmed,
      'min 3 characters',
    );
  }

  if (trimmed.length > 50000) {
    throw new OptionValidationError(
      `Topic too long (max 50000 characters). Received: ${trimmed.length} characters`,
      '--input',
      `${trimmed.substring(0, 100)}... (${trimmed.length} chars)`,
      'max 50000 characters',
    );
  }

  return trimmed;
}

/**
 * Validate a presentation generation input object.
 * Returns a list of validation errors (empty if valid).
 */
export function validateGenerateOptions(options: {
  topic?: string;
  theme?: string;
  language?: string;
  maxSlides?: number | string;
  aspectRatio?: string;
  output?: string;
}): string[] {
  const errors: string[] = [];

  try {
    if (options.topic !== undefined) validateTopic(options.topic);
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }

  try {
    if (options.theme !== undefined) validateTheme(options.theme);
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }

  try {
    if (options.language !== undefined) validateLanguage(options.language);
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }

  try {
    if (options.maxSlides !== undefined) validateMaxSlides(options.maxSlides);
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }

  try {
    if (options.aspectRatio !== undefined) validateAspectRatio(options.aspectRatio);
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }

  try {
    if (options.output !== undefined) validateOutputPath(options.output);
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }

  return errors;
}
