import { describe, expect, it } from 'vitest';
import { TextChunker } from '../textChunker';

const paragraph = (n: number): string =>
  Array.from({ length: n }, (_, i) => `Paragraph ${i}: ` + 'lorem ipsum dolor sit amet '.repeat(8)).join(
    '\n\n',
  );

describe('TextChunker', () => {
  it('returns a single chunk for short text', () => {
    const chunker = new TextChunker();
    const chunks = chunker.chunk('Short text');
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe('Short text');
    expect(chunks[0].position).toBe(0);
  });

  it('splits long text by markdown headings and preserves heading context', () => {
    const chunker = new TextChunker({ maxChunkSize: 200, minChunkSize: 10 });
    const text = [
      '# Intro',
      paragraph(1),
      '## Methods',
      paragraph(1),
      '## Results',
      paragraph(1),
    ].join('\n');

    const chunks = chunker.chunk(text);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    expect(chunks[0].heading).toBe('Intro');
    expect(chunks[0].headingLevel).toBe(1);
    expect(chunks.some((c) => c.heading === 'Methods')).toBe(true);
    expect(chunks.some((c) => c.heading === 'Results')).toBe(true);
  });

  it('positions are unique and ordered', () => {
    const chunker = new TextChunker({ maxChunkSize: 150, minChunkSize: 10 });
    const text = Array.from({ length: 20 }, (_, i) => `## H${i}\nsentence ${i}.`).join('\n');
    const chunks = chunker.chunk(text);
    const positions = chunks.map((c) => c.position);
    expect(new Set(positions).size).toBe(positions.length);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('never produces chunks exceeding maxChunkSize for long unstructured text', () => {
    const chunker = new TextChunker({ maxChunkSize: 300, minChunkSize: 20 });
    const text = paragraph(30);
    const chunks = chunker.chunk(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.charCount).toBeLessThanOrEqual(300);
      expect(chunk.content.length).toBeLessThanOrEqual(300);
    }
    // No content lost
    expect(chunks.reduce((a, c) => a + c.charCount, 0)).toBeGreaterThan(text.length - 300);
  });

  it('hard-splits text without spaces or punctuation', () => {
    const chunker = new TextChunker({ maxChunkSize: 50, minChunkSize: 5 });
    const text = 'a'.repeat(130);
    const chunks = chunker.chunk(text);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    expect(chunks.every((c) => c.charCount <= 50)).toBe(true);
  });

  it('chunksToContext formats headings and joins chunks', () => {
    const chunker = new TextChunker();
    const context = chunker.chunksToContext([
      { content: 'A body', heading: 'A', headingLevel: 1, position: 0, charCount: 6 },
      { content: 'B body', position: 1, charCount: 6 },
    ]);
    expect(context).toContain('[A]\nA body');
    expect(context).toContain('[Section 2]\nB body');
    expect(context).toContain('\n\n---\n\n');
  });
});
