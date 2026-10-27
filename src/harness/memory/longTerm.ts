import type { Presentation } from '../../schemas/presentation.schema';
import { logger } from '../../utils/logger';

export interface PresentationHistory {
  id: string;
  topic: string;
  createdAt: string;
  slideCount: number;
  rating?: number;
  feedback?: string;
  theme: string;
}

export interface SuccessPattern {
  pattern: string;
  count: number;
  lastUsed: string;
}

const log = logger.child('LongTermMemory');

export class LongTermMemory {
  private history: PresentationHistory[] = [];
  private successPatterns: SuccessPattern[] = [];

  async savePresentation(presentation: Presentation, rating?: number): Promise<void> {
    const record: PresentationHistory = {
      id: presentation.id,
      topic: presentation.title,
      createdAt: presentation.metadata.createdAt,
      slideCount: presentation.slides.length,
      rating,
      theme: presentation.theme.name,
    };

    this.history.push(record);
    log.info('Saved presentation to history', { id: record.id, topic: record.topic });
  }

  getHistory(): PresentationHistory[] {
    return [...this.history];
  }

  async saveFeedback(presentationId: string, feedback: string, rating: number): Promise<void> {
    const record = this.history.find((h) => h.id === presentationId);
    if (record) {
      record.feedback = feedback;
      record.rating = rating;
      log.info('Saved feedback', { presentationId, rating });
    }
  }

  addSuccessPattern(pattern: string): void {
    const existing = this.successPatterns.find((sp) => sp.pattern === pattern);
    if (existing) {
      existing.count++;
      existing.lastUsed = new Date().toISOString();
    } else {
      this.successPatterns.push({
        pattern,
        count: 1,
        lastUsed: new Date().toISOString(),
      });
    }
  }

  getSuccessPatterns(): SuccessPattern[] {
    return [...this.successPatterns].sort((a, b) => b.count - a.count);
  }

  getAverageRating(): number {
    const rated = this.history.filter((h) => h.rating !== undefined);
    if (rated.length === 0) return 0;
    return rated.reduce((sum, h) => sum + (h.rating || 0), 0) / rated.length;
  }

  getStats(): { totalPresentations: number; averageRating: number; topThemes: string[] } {
    const themeCounts: Record<string, number> = {};
    for (const h of this.history) {
      themeCounts[h.theme] = (themeCounts[h.theme] || 0) + 1;
    }
    const topThemes = Object.entries(themeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([theme]) => theme);

    return {
      totalPresentations: this.history.length,
      averageRating: this.getAverageRating(),
      topThemes,
    };
  }
}
