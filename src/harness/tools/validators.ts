import { Slide } from '../../schemas/slide.schema';
import { Presentation } from '../../schemas/presentation.schema';
import { logger } from '../../utils/logger';

const log = logger.child('Validators');

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export class Validators {
  static validateHTML(html: string): ValidationResult {
    const errors: string[] = [];

    // Basic HTML structure validation
    if (!html.includes('<html')) {
      errors.push('Missing <html> tag');
    }
    if (!html.includes('<head')) {
      errors.push('Missing <head> tag');
    }
    if (!html.includes('<body')) {
      errors.push('Missing <body> tag');
    }

    // Check for unclosed tags
    const openTags = (html.match(/<[a-z]+[^/]*>/gi) || []).length;
    const closeTags = (html.match(/<\/[a-z]+>/gi) || []).length;
    if (openTags !== closeTags) {
      errors.push(`Mismatched HTML tags: ${openTags} open, ${closeTags} close`);
    }

    return { valid: errors.length === 0, errors };
  }

  static validateCSS(css: string): ValidationResult {
    const errors: string[] = [];

    // Check for balanced braces
    const openBraces = (css.match(/{/g) || []).length;
    const closeBraces = (css.match(/}/g) || []).length;
    if (openBraces !== closeBraces) {
      errors.push(`Unbalanced CSS braces: ${openBraces} open, ${closeBraces} close`);
    }

    // Check for valid properties (basic check)
    const invalidProps = css.match(/[^{]+:\s*;/g);
    if (invalidProps) {
      for (const prop of invalidProps) {
        if (prop.trim().length < 3) {
          errors.push(`Possibly invalid CSS property: ${prop.trim()}`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  static validateSlideContent(slide: Slide): ValidationResult {
    const errors: string[] = [];

    if (!slide.content) {
      errors.push('Slide has no content');
      return { valid: false, errors };
    }

    if (!slide.content.title || slide.content.title.trim().length === 0) {
      errors.push('Slide is missing a title');
    }

    if (!slide.content.layout) {
      errors.push('Slide is missing a layout');
    }

    const validLayouts = [
      'title', 'title-bullets', 'two-column', 'image-left',
      'image-right', 'full-image', 'section-break', 'comparison',
      'chart', 'quote',
    ];

    if (slide.content.layout && !validLayouts.includes(slide.content.layout)) {
      errors.push(`Invalid layout: ${slide.content.layout}`);
    }

    if (slide.content.bullets && slide.content.bullets.length > 7) {
      errors.push(`Too many bullets: ${slide.content.bullets.length} (max 7)`);
    }

    return { valid: errors.length === 0, errors };
  }

  static validatePresentationStructure(presentation: Presentation): ValidationResult {
    const errors: string[] = [];

    if (!presentation.title) {
      errors.push('Presentation is missing a title');
    }

    if (!presentation.slides || presentation.slides.length === 0) {
      errors.push('Presentation has no slides');
    }

    if (!presentation.theme) {
      errors.push('Presentation is missing a theme');
    }

    if (!presentation.metadata) {
      errors.push('Presentation is missing metadata');
    }

    // Check for sequential indices
    if (presentation.slides) {
      for (let i = 0; i < presentation.slides.length; i++) {
        if (presentation.slides[i].index !== i) {
          errors.push(`Slide at position ${i} has incorrect index: ${presentation.slides[i].index}`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }
}