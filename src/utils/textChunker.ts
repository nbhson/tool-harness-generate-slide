import { logger } from './logger';

const log = logger.child('TextChunker');

export interface TextChunk {
  content: string;
  heading?: string;
  headingLevel?: number;
  position: number;
  charCount: number;
}

export interface ChunkingConfig {
  maxChunkSize: number; // Max chars per chunk (default: 1500)
  minChunkSize: number; // Min chars to avoid tiny chunks (default: 200)
  overlap: number; // Overlap between chunks (default: 100)
}

const defaultConfig: ChunkingConfig = {
  maxChunkSize: 1500,
  minChunkSize: 200,
  overlap: 100,
};

/**
 * Smart Text Chunker
 *
 * Splits long text into meaningful chunks based on document structure.
 * Strategy (in priority order):
 *   1. Split by markdown headings (#, ##, ###)
 *   2. Split by paragraph breaks (\n\n)
 *   3. Split by sentence boundaries (. ! ?)
 *   4. Split by word boundaries (fallback)
 *
 * Each chunk preserves its heading context for LLM prompts.
 */
export class TextChunker {
  private config: ChunkingConfig;

  constructor(config: Partial<ChunkingConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
  }

  /**
   * Main entry point: chunk text intelligently
   */
  chunk(text: string): TextChunk[] {
    log.info('Chunking text', { length: text.length, maxChunkSize: this.config.maxChunkSize });

    // If text is short enough, return as single chunk
    if (text.length <= this.config.maxChunkSize) {
      return [
        {
          content: text.trim(),
          position: 0,
          charCount: text.length,
        },
      ];
    }

    // Strategy 1: Split by headings
    let chunks = this.splitByHeadings(text);

    // Merge tiny chunks
    chunks = this.mergeTinyChunks(chunks);

    // Split oversized chunks further
    chunks = this.splitOversizedChunks(chunks);

    log.info('Chunking complete', {
      chunkCount: chunks.length,
      avgSize: Math.round(chunks.reduce((a, c) => a + c.charCount, 0) / chunks.length),
    });

    return chunks;
  }

  /**
   * Strategy 1: Split by markdown headings
   */
  private splitByHeadings(text: string): TextChunk[] {
    const lines = text.split('\n');
    const chunks: TextChunk[] = [];
    let currentContent = '';
    let currentHeading = '';
    let currentHeadingLevel = 0;
    let position = 0;

    for (const line of lines) {
      const headingMatch = line.match(/^(#{1,3})\s+(.+)/);

      if (headingMatch) {
        // Save previous chunk if it has content
        if (currentContent.trim()) {
          chunks.push({
            content: currentContent.trim(),
            heading: currentHeading,
            headingLevel: currentHeadingLevel,
            position,
            charCount: currentContent.trim().length,
          });
          position++;
        }

        // Start new chunk with heading
        currentHeading = headingMatch[2].trim();
        currentHeadingLevel = headingMatch[1].length;
        currentContent = line + '\n';
      } else {
        currentContent += line + '\n';
      }
    }

    // Don't forget the last chunk
    if (currentContent.trim()) {
      chunks.push({
        content: currentContent.trim(),
        heading: currentHeading,
        headingLevel: currentHeadingLevel,
        position,
        charCount: currentContent.trim().length,
      });
    }

    return chunks;
  }

  /**
   * Strategy 2: Split a long text by paragraph breaks
   */
  private splitByParagraphs(text: string, baseHeading?: string): TextChunk[] {
    const paragraphs = text.split(/\n\n+/);
    const chunks: TextChunk[] = [];
    let currentContent = '';
    let position = 0;

    for (const para of paragraphs) {
      const testContent = currentContent ? currentContent + '\n\n' + para : para;

      if (testContent.length > this.config.maxChunkSize && currentContent) {
        chunks.push({
          content: currentContent.trim(),
          heading: baseHeading,
          position,
          charCount: currentContent.trim().length,
        });
        position++;
        currentContent = para;
      } else {
        currentContent = testContent;
      }
    }

    if (currentContent.trim()) {
      chunks.push({
        content: currentContent.trim(),
        heading: baseHeading,
        position,
        charCount: currentContent.trim().length,
      });
    }

    return chunks;
  }

  /**
   * Strategy 3: Split by sentence boundaries
   */
  private splitBySentences(text: string, baseHeading?: string): TextChunk[] {
    const sentences = text.match(/[^.!?]+[.!?]+\s*/g) || [text];
    const chunks: TextChunk[] = [];
    let currentContent = '';
    let position = 0;

    for (const sentence of sentences) {
      const testContent = currentContent ? currentContent + ' ' + sentence.trim() : sentence.trim();

      if (testContent.length > this.config.maxChunkSize && currentContent) {
        chunks.push({
          content: currentContent.trim(),
          heading: baseHeading,
          position,
          charCount: currentContent.trim().length,
        });
        position++;
        currentContent = sentence.trim();
      } else {
        currentContent = testContent;
      }
    }

    if (currentContent.trim()) {
      chunks.push({
        content: currentContent.trim(),
        heading: baseHeading,
        position,
        charCount: currentContent.trim().length,
      });
    }

    return chunks;
  }

  /**
   * Strategy 4: Hard split by character count (fallback)
   */
  private hardSplit(text: string, baseHeading?: string): TextChunk[] {
    const chunks: TextChunk[] = [];
    let remaining = text;
    let position = 0;

    while (remaining.length > 0) {
      if (remaining.length <= this.config.maxChunkSize) {
        chunks.push({
          content: remaining.trim(),
          heading: baseHeading,
          position,
          charCount: remaining.trim().length,
        });
        break;
      }

      // Try to split at a space near the limit
      let splitIndex = remaining.lastIndexOf(' ', this.config.maxChunkSize);
      if (splitIndex < this.config.minChunkSize) {
        splitIndex = this.config.maxChunkSize;
      }

      chunks.push({
        content: remaining.substring(0, splitIndex).trim(),
        heading: baseHeading,
        position,
        charCount: remaining.substring(0, splitIndex).trim().length,
      });

      remaining = remaining.substring(splitIndex).trim();
      position++;
    }

    return chunks;
  }

  /**
   * Merge chunks that are too small with their neighbors
   */
  private mergeTinyChunks(chunks: TextChunk[]): TextChunk[] {
    if (chunks.length <= 1) return chunks;

    const merged: TextChunk[] = [];
    let buffer = chunks[0];

    for (let i = 1; i < chunks.length; i++) {
      const current = chunks[i];

      if (buffer.charCount < this.config.minChunkSize) {
        // Merge tiny chunk with next
        buffer = {
          content: buffer.content + '\n\n' + current.content,
          heading: buffer.heading || current.heading,
          headingLevel: buffer.headingLevel || current.headingLevel,
          position: buffer.position,
          charCount: buffer.charCount + current.charCount + 2,
        };
      } else {
        merged.push(buffer);
        buffer = current;
      }
    }

    merged.push(buffer);
    return merged;
  }

  /**
   * Split chunks that exceed maxChunkSize using sub-strategies
   */
  private splitOversizedChunks(chunks: TextChunk[]): TextChunk[] {
    const result: TextChunk[] = [];

    for (const chunk of chunks) {
      if (chunk.charCount <= this.config.maxChunkSize) {
        result.push(chunk);
        continue;
      }

      // Try paragraph split, then sentence, then hard split
      let subChunks = this.splitByParagraphs(chunk.content, chunk.heading);
      if (subChunks.length <= 1) {
        subChunks = this.splitBySentences(chunk.content, chunk.heading);
      }
      if (subChunks.length <= 1) {
        subChunks = this.hardSplit(chunk.content, chunk.heading);
      }

      // Preserve heading context in sub-chunks
      result.push(
        ...subChunks.map((sc, i) => ({
          ...sc,
          heading: sc.heading || chunk.heading,
          headingLevel: sc.headingLevel || chunk.headingLevel,
          position: chunk.position + i * 0.01, // Maintain relative order
        })),
      );
    }

    return result;
  }

  /**
   * Convert chunks to a formatted context string for LLM
   */
  chunksToContext(chunks: TextChunk[]): string {
    return chunks
      .map((chunk, i) => {
        const heading = chunk.heading ? `[${chunk.heading}]` : `[Section ${i + 1}]`;
        return `${heading}\n${chunk.content}`;
      })
      .join('\n\n---\n\n');
  }
}
