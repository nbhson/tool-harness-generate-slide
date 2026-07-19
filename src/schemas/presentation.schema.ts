import { Slide, SlideTheme } from './slide.schema';

export interface Presentation {
  id: string;
  title: string;
  subtitle?: string;
  slides: Slide[];
  theme: SlideTheme;
  metadata: PresentationMetadata;
  isValid: boolean;
  validationErrors: string[];
}

export interface PresentationMetadata {
  createdAt: string;
  updatedAt: string;
  language: string;
  aspectRatio: '16:9' | '4:3';
  totalSlides: number;
  topic: string;
  author?: string;
}

export interface GeneratePresentationInput {
  topic: string;
  outline?: string[];
  style?: string;
  language?: string;
  maxSlides?: number;
  aspectRatio?: '16:9' | '4:3';
  theme?: string;
}

export interface GeneratePresentationOptions {
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