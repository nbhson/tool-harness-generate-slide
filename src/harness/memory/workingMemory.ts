import type { Slide } from '../../schemas/slide.schema';

export interface WorkingMemoryData {
  currentSlideIndex: number;
  generatedSlides: Slide[];
  pendingRetries: Map<number, string>;
  contextWindow: string[];
  scratchPad: Record<string, unknown>;
}

export class WorkingMemory {
  private data: WorkingMemoryData;

  constructor() {
    this.data = {
      currentSlideIndex: 0,
      generatedSlides: [],
      pendingRetries: new Map(),
      contextWindow: [],
      scratchPad: {},
    };
  }

  setCurrentSlideIndex(index: number): void {
    this.data.currentSlideIndex = index;
  }

  getCurrentSlideIndex(): number {
    return this.data.currentSlideIndex;
  }

  addGeneratedSlide(slide: Slide): void {
    this.data.generatedSlides.push(slide);
  }

  getGeneratedSlides(): Slide[] {
    return [...this.data.generatedSlides];
  }

  addPendingRetry(slideIndex: number, reason: string): void {
    this.data.pendingRetries.set(slideIndex, reason);
  }

  removePendingRetry(slideIndex: number): void {
    this.data.pendingRetries.delete(slideIndex);
  }

  getPendingRetries(): Map<number, string> {
    return new Map(this.data.pendingRetries);
  }

  hasPendingRetries(): boolean {
    return this.data.pendingRetries.size > 0;
  }

  addToContextWindow(text: string): void {
    this.data.contextWindow.push(text);
    // Keep only last 10 context entries
    if (this.data.contextWindow.length > 10) {
      this.data.contextWindow.shift();
    }
  }

  getContextWindow(): string[] {
    return [...this.data.contextWindow];
  }

  setScratchPad(key: string, value: unknown): void {
    this.data.scratchPad[key] = value;
  }

  getScratchPad<T = unknown>(key: string): T | undefined {
    return this.data.scratchPad[key] as T;
  }

  reset(): void {
    this.data = {
      currentSlideIndex: 0,
      generatedSlides: [],
      pendingRetries: new Map(),
      contextWindow: [],
      scratchPad: {},
    };
  }
}
