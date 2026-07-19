export interface SlideContent {
  title: string;
  subtitle?: string;
  bullets: string[];
  notes?: string;
  layout: SlideLayout;
  visuals?: SlideVisuals;
}

export interface SlideVisuals {
  backgroundColor?: string;
  textColor?: string;
  accentColor?: string;
  images?: SlideImage[];
  chart?: SlideChart;
}

export interface SlideImage {
  url?: string;
  base64?: string;
  alt: string;
  position?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface SlideChart {
  type: 'bar' | 'line' | 'pie' | 'area';
  data: Record<string, number | string>[];
  title?: string;
}

export type SlideLayout =
  | 'title'
  | 'title-bullets'
  | 'two-column'
  | 'image-left'
  | 'image-right'
  | 'full-image'
  | 'section-break'
  | 'comparison'
  | 'chart'
  | 'quote';

export interface Slide {
  id: string;
  index: number;
  content: SlideContent;
  isValid: boolean;
  validationErrors: string[];
}

export interface SlideTheme {
  name: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
    textLight: string;
  };
  fonts: {
    title: string;
    body: string;
    accent: string;
  };
  layout: {
    width: number;
    height: number;
    padding: {
      top: number;
      left: number;
      right: number;
      bottom: number;
    };
  };
}