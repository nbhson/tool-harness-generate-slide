import { UserPreferences, defaultUserPreferences } from '../../schemas/userPreferences.schema';

export interface SessionData {
  preferences: UserPreferences;
  currentTopic: string;
  generatedSlides: number;
  errors: string[];
  startTime: string;
}

export class ShortTermMemory {
  private session: SessionData;

  constructor() {
    this.session = this.createFreshSession();
  }

  private createFreshSession(): SessionData {
    return {
      preferences: { ...defaultUserPreferences },
      currentTopic: '',
      generatedSlides: 0,
      errors: [],
      startTime: new Date().toISOString(),
    };
  }

  getPreferences(): UserPreferences {
    return this.session.preferences;
  }

  updatePreferences(prefs: Partial<UserPreferences>): void {
    this.session.preferences = { ...this.session.preferences, ...prefs };
  }

  setCurrentTopic(topic: string): void {
    this.session.currentTopic = topic;
  }

  getCurrentTopic(): string {
    return this.session.currentTopic;
  }

  incrementGeneratedSlides(): void {
    this.session.generatedSlides++;
  }

  getGeneratedSlidesCount(): number {
    return this.session.generatedSlides;
  }

  addError(error: string): void {
    this.session.errors.push(error);
  }

  getErrors(): string[] {
    return [...this.session.errors];
  }

  getSessionData(): SessionData {
    return { ...this.session };
  }

  reset(): void {
    this.session = this.createFreshSession();
  }
}