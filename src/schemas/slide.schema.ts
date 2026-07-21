export interface SlideTable {
  headers: string[];
  rows: string[][];
  title?: string;
}

export interface SlideContent {
  title: string;
  subtitle?: string;
  bullets: string[];
  notes?: string;
  layout: SlideLayout;
  visuals?: SlideVisuals;
  table?: SlideTable;
  timeline?: TimelineItem[];
  flowchart?: Flowchart;
  infographic?: InfographicElement[];
  stats?: StatItem[];
  faq?: FAQItem[];
  testimonials?: TestimonialItem[];
  pricing?: PricingItem[];
  code?: CodeBlock;
  video?: VideoEmbed;
  imageGrid?: SlideImage[];
}

export interface SlideVisuals {
  backgroundColor?: string;
  textColor?: string;
  accentColor?: string;
  images?: SlideImage[];
  chart?: SlideChart;
  icon?: string;
  icons?: string[];
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
  type: 'bar' | 'line' | 'pie' | 'area' | 'doughnut' | 'radar' | 'scatter';
  data: Record<string, number | string>[];
  title?: string;
  labels?: string[];
  colors?: string[];
}

export interface TimelineItem {
  date: string;
  title: string;
  description: string;
  icon?: string;
}

export interface FlowchartNode {
  id: string;
  label: string;
  type?: 'start' | 'end' | 'process' | 'decision' | 'input' | 'output';
  x?: number;
  y?: number;
}

export interface FlowchartEdge {
  from: string;
  to: string;
  label?: string;
}

export interface Flowchart {
  nodes: FlowchartNode[];
  edges: FlowchartEdge[];
  direction?: 'horizontal' | 'vertical';
}

export interface InfographicElement {
  type: 'header' | 'text' | 'image' | 'chart' | 'icon' | 'stat';
  content: string;
  position: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  style?: {
    color?: string;
    backgroundColor?: string;
    fontSize?: number;
    fontWeight?: string;
  };
}

export interface StatItem {
  value: string | number;
  label: string;
  icon?: string;
  color?: string;
}

export interface FAQItem {
  question: string;
  answer: string;
}

export interface TestimonialItem {
  quote: string;
  author: string;
  title?: string;
  company?: string;
  avatar?: string;
}

export interface PricingItem {
  name: string;
  price: string;
  period?: string;
  features: string[];
  highlighted?: boolean;
  buttonText?: string;
}

export interface CodeBlock {
  language: string;
  code: string;
  title?: string;
  lineNumbers?: boolean;
}

export interface VideoEmbed {
  url: string;
  type: 'youtube' | 'vimeo' | 'mp4' | 'webm';
  title?: string;
  poster?: string;
  autoplay?: boolean;
  controls?: boolean;
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
  | 'quote'
  | 'table'
  | 'timeline'
  | 'flowchart'
  | 'infographic'
  | 'stats'
  | 'image-grid'
  | 'video'
  | 'code'
  | 'faq'
  | 'testimonial'
  | 'pricing';

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