import type { Presentation, PresentationMetadata } from '../schemas/presentation.schema';
import type { Slide, SlideTheme } from '../schemas/slide.schema';

export const testTheme: SlideTheme = {
  name: 'modern',
  colors: {
    primary: '#3B82F6',
    secondary: '#1E40AF',
    accent: '#F59E0B',
    background: '#FFFFFF',
    text: '#111827',
    textLight: '#6B7280',
  },
  fonts: {
    title: 'Arial',
    body: 'Arial',
    accent: 'Georgia',
  },
  layout: {
    width: 1280,
    height: 720,
    padding: { top: 48, left: 64, right: 64, bottom: 48 },
  },
};

export function makeSlide(index: number, overrides: Partial<Slide['content']> = {}): Slide {
  return {
    id: `slide-${index}`,
    index,
    content: {
      title: `Slide ${index + 1}`,
      bullets: ['Point one', 'Point two'],
      layout: 'title-bullets',
      ...overrides,
    },
    isValid: true,
    validationErrors: [],
  };
}

export function makeMetadata(
  overrides: Partial<PresentationMetadata> = {},
): PresentationMetadata {
  return {
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    language: 'en',
    aspectRatio: '16:9',
    totalSlides: 2,
    topic: 'Test topic',
    ...overrides,
  };
}

export function makePresentation(
  slides: Slide[] = [makeSlide(0, { layout: 'title', bullets: [] }), makeSlide(1)],
  overrides: Partial<Presentation> = {},
): Presentation {
  return {
    id: 'pres-1',
    title: 'Test Presentation',
    slides,
    theme: testTheme,
    metadata: makeMetadata({ totalSlides: slides.length }),
    isValid: true,
    validationErrors: [],
    ...overrides,
  };
}
