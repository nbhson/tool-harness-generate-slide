export interface UserPreferences {
  themes: string[];
  colorSchemes: string[];
  layouts: string[];
  language: string;
  maxSlides: number;
  aspectRatio: '16:9' | '4:3';
}

export const defaultUserPreferences: UserPreferences = {
  themes: ['modern', 'minimal', 'corporate', 'creative'],
  colorSchemes: ['#0066CC', '#333333', '#1a1a2e'],
  layouts: ['title-bullets', 'image-left', 'two-column', 'full-image'],
  language: 'vi',
  maxSlides: 20,
  aspectRatio: '16:9',
};
