import { SlideContent, SlideLayout } from '../../schemas/slide.schema';
import { logger } from '../../utils/logger';
import { generateId } from '../../utils/helpers';
import { TextChunker, TextChunk } from '../../utils/textChunker';
import { ConcurrencyPool } from '../../utils/concurrency';
import { CircuitBreaker } from '../../utils/circuitBreaker';
import { RequestCoalescer } from '../../utils/requestCoalescer';
import { ResponseCache } from '../memory/cache';
import { SlideExporter } from './slideExporter';

const log = logger.child('ContentGenerator');

export interface SlidePlan {
  title: string;
  layout: SlideLayout;
  bullets: string[];
  subtitle?: string;
  notes?: string;
  chunkIndex?: number;    // Which chunk this slide comes from
}

export interface ContentGeneratorConfig {
  baseUrl: string;
  apiKey?: string;
  model: string;
  fallbackModel: string;
}

export class ContentGenerator {
  private config: ContentGeneratorConfig;
  private chunker: TextChunker;
  private circuitBreaker: CircuitBreaker;
  private coalescer: RequestCoalescer;
  private cache: ResponseCache;

  constructor(config: ContentGeneratorConfig) {
    this.config = config;
    this.chunker = new TextChunker({ maxChunkSize: 1500, minChunkSize: 200 });
    this.circuitBreaker = new CircuitBreaker('LLM', {
      failureThreshold: 3,
      resetTimeoutMs: 30_000,
      halfOpenSuccessThreshold: 2,
    });
    this.coalescer = new RequestCoalescer(60_000);
    this.cache = new ResponseCache({ ttlMs: 3_600_000, enabled: true });
  }

  async generateSlideContent(
    context: string,
    plan: SlidePlan,
    onStreamChunk?: (chunk: string) => void
  ): Promise<SlideContent> {
    log.info(`Generating content for slide: ${plan.title}`);

    const prompt = this.buildContentPrompt(context, plan);

    try {
      const response = await this.callLLM(prompt, onStreamChunk);
      const content = this.parseContentResponse(response, plan);
      return content;
    } catch (error) {
      log.warn(`LLM unavailable for slide "${plan.title}", using plan content as fallback`);
      // Use plan's bullets directly - they already came from outline/LLM/chunk extraction
      return this.generateEnhancedFallback(plan);
    }
  }

  async generateOutline(topic: string, outline?: string[], maxSlides?: number): Promise<SlidePlan[]> {
    log.info('Generating presentation outline', { topic: topic.substring(0, 100) + '...' });

    // Smart chunking for long input
    const chunks = this.chunker.chunk(topic);
    log.info('Input chunked', { chunkCount: chunks.length, inputLength: topic.length });

    if (chunks.length === 1) {
      // Short input: generate outline directly
      return this.generateOutlineFromText(topic, outline, maxSlides);
    }

    // Long input: use chunks to create section-aware outline
    return this.generateOutlineFromChunks(chunks, outline, maxSlides);
  }

  /**
   * Short input: direct outline generation (existing behavior)
   */
  private async generateOutlineFromText(topic: string, outline?: string[], maxSlides?: number): Promise<SlidePlan[]> {
    const prompt = this.buildOutlinePrompt(topic, outline, maxSlides);

    try {
      const response = await this.callLLM(prompt);
      log.info('Outline LLM response received', { length: response.length, preview: response.substring(0, 200) });
      const plans = this.parseOutlineResponse(response);
      return plans.length > 0 ? plans : this.generateDefaultOutline(topic);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : JSON.stringify(error);
      log.error('Outline generation failed, using default', { error: errMsg });
      return this.generateDefaultOutline(topic);
    }
  }

  /**
   * Long input: use chunks to create section-aware outline
   * Each chunk becomes a section with 1-3 slides
   */
  private async generateOutlineFromChunks(chunks: TextChunk[], outline?: string[], maxSlides?: number): Promise<SlidePlan[]> {
    const maxSlidesPerChunk = maxSlides ? Math.ceil(maxSlides / chunks.length) : 3;

    // Build a compact overview from chunk headings for the title slide
    const overview = chunks.map(c => c.heading || `Section ${c.position + 1}`).join(', ');

    // Title slide (no LLM call needed)
    const titlePlan: SlidePlan = {
      title: chunks[0].heading || 'Presentation',
      layout: 'title',
      bullets: [],
      subtitle: `${chunks.length} sections`,
    };

    // Thank-you slide (no LLM call needed)
    const thankYouPlan: SlidePlan = {
      title: 'Thank You',
      layout: 'title',
      bullets: [],
      subtitle: 'Questions & Discussion',
    };

    // Create parallel tasks for all chunks
    const chunkTasks = chunks.map((chunk, i) => async (): Promise<{ chunkIndex: number; plans: SlidePlan[] }> => {
      try {
        const prompt = this.buildChunkOutlinePrompt(chunk, maxSlidesPerChunk);
        log.info(`Calling LLM for chunk ${i}/${chunks.length}`, { heading: chunk.heading, contentLength: chunk.charCount });
        const response = await this.callLLM(prompt);
        log.info(`LLM response received for chunk ${i}`, { responseLength: response.length, preview: response.substring(0, 200) });
        const chunkPlans = this.parseOutlineResponse(response);

        if (chunkPlans.length === 0) {
          log.warn(`Chunk ${i} LLM response had no parseable slides, using template`, { responsePreview: response.substring(0, 500) });
          return {
            chunkIndex: i,
            plans: [{
              title: chunk.heading || `Section ${i + 1}`,
              layout: 'title-bullets',
              bullets: this.extractKeyPoints(chunk.content),
              chunkIndex: i,
            }],
          };
        } else {
          return {
            chunkIndex: i,
            plans: chunkPlans.map(p => ({ ...p, chunkIndex: i })),
          };
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : JSON.stringify(error);
        log.warn(`Chunk ${i} outline failed, using extracted key points`, { error: errMsg, chunkHeading: chunk.heading });
        return {
          chunkIndex: i,
          plans: [{
            title: chunk.heading || `Section ${i + 1}`,
            layout: 'title-bullets',
            bullets: this.extractKeyPoints(chunk.content),
            chunkIndex: i,
          }],
        };
      }
    });

    // Execute all chunk outlines in parallel
    log.info(`Processing ${chunkTasks.length} chunks in parallel`);
    const pool = new ConcurrencyPool({ concurrency: 10 });
    const results = await pool.runBatch(chunkTasks);

    // Merge results in order
    let allPlans: SlidePlan[] = [titlePlan];

    // Sort by chunk index to maintain order
    const sortedResults = results
      .filter(r => r.status === 'fulfilled' && r.value)
      .sort((a, b) => (a.value?.chunkIndex || 0) - (b.value?.chunkIndex || 0));

    for (const result of sortedResults) {
      if (result.value) {
        allPlans.push(...result.value.plans);
      }
    }

    allPlans.push(thankYouPlan);

    // Enforce maxSlides limit
    if (maxSlides && allPlans.length > maxSlides) {
      allPlans = allPlans.slice(0, maxSlides);
    }

    return allPlans;
  }

  /**
   * Build outline prompt for a single chunk
   */
  private buildChunkOutlinePrompt(chunk: TextChunk, maxSlides: number): string {
    // Pass richer content chunk for deep outline context
    const content = chunk.content.substring(0, 1800);

    return `Create ${maxSlides} detailed presentation slides from this section.

Section: "${chunk.heading || 'Content'}"
Content:
${content}

Respond ONLY with a JSON array (no explanation):
[{"title":"Slide title","layout":"title-bullets","bullets":["**Key Header**: Thorough, detailed explanation point with deep technical context..."]}]

Rules:
- 10-30 comprehensive bullets per slide, 200-500 words each
- Every bullet MUST start with a bold lead-in title \`**Header**: Full detailed description\`
- Use JSON format only`;
  }

  /**
   * Extract key points from text (fallback when LLM fails)
   */
  private extractKeyPoints(text: string): string[] {
    const sentences = text.split(/[.!?\n]+/).filter(s => s.trim().length > 10);
    return sentences.slice(0, 15).map(s => {
      const clean = SlideExporter.cleanMarkdownText(s);
      if (!clean) return '';
      const words = clean.split(/\s+/);
      if (words.length > 3) {
        const header = words.slice(0, 3).join(' ');
        const rest = words.slice(3).join(' ');
        return `**${header}**: ${rest}`;
      }
      return clean;
    }).filter(s => s.length > 0);
  }

  /**
   * Get the chunk context for a specific slide during design phase
   */
  getChunkContext(chunks: TextChunk[], chunkIndex: number): string {
    const chunk = chunks[chunkIndex];
    return chunk ? this.chunker.chunksToContext([chunk]) : '';
  }

  /**
   * Public: chunk text and return chunks (for use by DesignerAgent)
   */
  chunkText(text: string): TextChunk[] {
    return this.chunker.chunk(text);
  }

  /**
   * Public: convert chunks to context string
   */
  chunksToContext(chunks: TextChunk[]): string {
    return this.chunker.chunksToContext(chunks);
  }

  private buildOutlinePrompt(topic: string, outline?: string[], maxSlides?: number): string {
    let prompt = `You are an executive presentation architect. Create an in-depth, highly detailed presentation outline for: "${topic}"

${maxSlides ? `Maximum ${maxSlides} slides.` : 'Aim for 6-12 slides.'}
`;

    if (outline && outline.length > 0) {
      prompt += `\nUser-provided structure:\n${outline.map((o, i) => `${i + 1}. ${o}`).join('\n')}\n`;
    }

    prompt += `
Respond in JSON format with an array of slide objects:
[
  {
    "title": "Clear, Engaging Slide Title",
    "layout": "title | title-bullets | two-column | comparison | section-break | chart | quote",
    "bullets": ["**Specific Header 1**: Comprehensive, detailed explanation with context, data, or action items (30-50 words)", "**Specific Header 2**: Comprehensive, detailed explanation with context, data, or action items (30-50 words)"],
    "subtitle": "Informative, context-rich subtitle"
  }
]

Rules:
- Slide 1 must be 'title' layout.
- Include visual variety: mix title-bullets, two-column, comparison, section-break, quote, and chart layouts. Do NOT use table layout.
- Final slide should be conclusion/thank-you (layout: 'title').
- Write content in the same language as the topic (e.g., Vietnamese if topic is in Vietnamese).
- Each bullet MUST start with a real topic header like \`**Thực tế thị trường**: Chi tiết...\`.
- NEVER use generic headers like "Điểm quan trọng 1", "Point 1", "Mục 1".
- NEVER use ASCII box drawing characters (┌, ─, │, └) or pipe table characters (|).`;
    return prompt;
  }

  private buildContentPrompt(context: string, plan: SlidePlan): string {
    const layoutInstructions: Record<string, string> = {
      'title': 'Create a high-impact main title and an engaging, informative subtitle. Leave bullets array empty.',
      'title-bullets': 'Provide 5-7 rich, highly detailed bullet points. EVERY bullet MUST start with a bold key concept header: "**Header**: Thorough explanation with specific technical context, mechanisms, background, or action items (30-60 words per point)".',
      'two-column': 'Provide 4-6 detailed bullet points structured as two pairs of contrasting or complementary concepts. Format: "**Concept**: Deep, complete explanation (30-50 words)".',
      'comparison': 'Provide 4-6 detailed bullet points comparing options, solutions, or before/after states. Format: "**Option A / Pros**: Deep, detailed comparative analysis (30-50 words)".',
      'section-break': 'Provide a bold section title and a brief motivational or summary subtitle. Leave bullets array empty or 2-3 detailed highlights.',
      'quote': 'Provide an impactful quote as the title or subtitle. Place author or source attribution in subtitle or notes.',
      'chart': 'Provide 4-5 key data insights starting with bold metrics or labels: "**Metric (+45%)**: Detailed analytical summary of performance impact, timeline, and growth drivers".',
    };

    const layoutGuide = layoutInstructions[plan.layout] || 'Provide 5-7 clear bullet points starting with bold lead-in headers: "**Header**: Thorough, in-depth explanation (30-50 words)".';

    return `You are an executive presentation content architect. Generate deep, comprehensive slide content based on the context and plan below.

CONTEXT:
${context}

SLIDE PLAN:
- Title: ${plan.title}
- Layout: ${plan.layout}
- Key points: ${plan.bullets.join('; ')}

LAYOUT SPECIFIC INSTRUCTION:
${layoutGuide}

Respond strictly in valid JSON format:
{
  "title": "slide title",
  "subtitle": "informative context-rich subtitle",
  "bullets": [
    "**Specific Concept 1**: Comprehensive, thorough explanation sentence providing deep technical background, practical context, and actionable takeaways...",
    "**Specific Concept 2**: Comprehensive, thorough explanation sentence providing deep technical background, practical context, and actionable takeaways..."
  ],
  "notes": "Detailed, comprehensive speaker notes (100-150 words) covering key discussion points, background rationale, and presentation guidance."
}

Formatting & Quality Rules:
1. EVERY bullet MUST start with a bold lead-in header formatted as \`**Key Concept**: Full detailed explanation\`.
2. NEVER use generic headers like "Điểm quan trọng 1", "Điểm quan trọng 2", "Mục 1", "Point 1". Always use real topic concepts.
3. NEVER output ASCII box drawing characters (┌, ─, │, └, ┘, ┼) or raw pipe borders (|).
4. Provide DEEP, THOROUGH, and COMPLETE text information for each point (aim for 30-60 words per bullet point). NEVER generate brief 5-10 word fragments.
5. Include 5-7 detailed bullet points for content slides.
6. Match the EXACT language of the topic/context (e.g., Vietnamese if context is Vietnamese).
7. Never output raw markdown code fences or raw text outside the JSON.`;
  }

  private async callLLM(prompt: string, onStreamChunk?: (chunk: string) => void): Promise<string> {
    // Phase 5: Check cache first
    const cacheKey = ResponseCache.hash(prompt + this.config.model);
    return this.cache.getOrCompute(cacheKey, async () => {
      // Phase 9+11: Execute through circuit breaker + request coalescing
      return this.coalescer.deduplicate(cacheKey, () =>
        this.circuitBreaker.execute(
          () => this.executeLLMRequest(prompt, undefined, onStreamChunk),
          async () => {
            // Circuit open: try fallback model directly
            log.info('Circuit open, trying fallback model directly');
            return this.executeLLMRequest(prompt, this.config.fallbackModel, onStreamChunk);
          }
        )
      );
    });
  }

  private async executeLLMRequest(
    prompt: string,
    overrideModel?: string,
    onStreamChunk?: (chunk: string) => void
  ): Promise<string> {
    const url = `${this.config.baseUrl}/v1/chat/completions`;
    const model = overrideModel || this.config.model;

    log.info('Calling LLM', { url, model });

    const body = {
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 4096,
      stream: Boolean(onStreamChunk),
    };

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Connection': 'keep-alive',
          'Keep-Alive': 'timeout=60, max=1000',
          ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
        },
        body: JSON.stringify(body),
        keepalive: true,
      });
    } catch (fetchError) {
      const msg = fetchError instanceof Error ? fetchError.message : String(fetchError);
      log.error('LLM connection failed', { url, error: msg });
      throw new Error(`Cannot connect to LLM at ${url}: ${msg}`);
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'no body');
      log.warn(`Model ${model} failed (${response.status})`, { body: errorBody });

      // If this was already the fallback, throw
      if (overrideModel) {
        throw new Error(`Fallback model ${model} failed: ${response.status} - ${errorBody}`);
      }

      // Try fallback model
      log.info('Trying fallback model', { model: this.config.fallbackModel });
      try {
        const fallbackBody = { ...body, model: this.config.fallbackModel };
        const fallbackResponse = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Connection': 'keep-alive',
            'Keep-Alive': 'timeout=60, max=1000',
            ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
          },
          body: JSON.stringify(fallbackBody),
          keepalive: true,
        });

        if (!fallbackResponse.ok) {
          const fbBody = await fallbackResponse.text().catch(() => 'no body');
          throw new Error(`Both models failed. Primary: ${response.status}, Fallback: ${fallbackResponse.status} - ${fbBody}`);
        }

        return await this.extractContent(fallbackResponse, onStreamChunk);
      } catch (fbError) {
        if (fbError instanceof Error && fbError.message.startsWith('Both models')) throw fbError;
        throw new Error(`Primary: ${response.status} - ${errorBody}. Fallback error: ${fbError}`);
      }
    }

    return await this.extractContent(response, onStreamChunk);
  }

  /**
   * Extract content from LLM response.
   * Handles both JSON responses and SSE stream format.
   */
  private async extractContent(response: Response, onStreamChunk?: (chunk: string) => void): Promise<string> {
    const text = await response.text();

    // Try standard JSON first
    try {
      const data = JSON.parse(text) as any;
      const content = data.choices?.[0]?.message?.content || '';
      if (content) {
        if (onStreamChunk) onStreamChunk(content);
        return content;
      }
    } catch {
      // Not JSON - might be SSE stream
    }

    // Try SSE stream format: lines like "data: {...}"
    const content = this.parseSSEStream(text, onStreamChunk);
    if (content) return content;

    throw new Error('LLM returned empty or unparseable response');
  }

  /**
   * Parse SSE (Server-Sent Events) stream response.
   * Extracts content from lines like: data: {"choices":[{"delta":{"content":"..."}}]}
   */
  private parseSSEStream(text: string, onStreamChunk?: (chunk: string) => void): string {
    const lines = text.split('\n');
    let content = '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;

      const jsonStr = trimmed.slice(5).trim();
      if (jsonStr === '[DONE]') continue;

      try {
        const event = JSON.parse(jsonStr);
        // Standard OpenAI SSE: choices[0].delta.content
        const delta = event.choices?.[0]?.delta?.content;
        if (delta) {
          content += delta;
          if (onStreamChunk) onStreamChunk(delta);
        }
        // Non-streaming in SSE format: choices[0].message.content
        const msgContent = event.choices?.[0]?.message?.content;
        if (msgContent) {
          content += msgContent;
          if (onStreamChunk) onStreamChunk(msgContent);
        }
      } catch {
        // Skip unparseable lines
      }
    }

    return content;
  }

  private parseContentResponse(response: string, plan: SlidePlan): SlideContent {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const cleanTitle = SlideExporter.cleanMarkdownText(parsed.title || plan.title || '');
        const cleanSubtitle = SlideExporter.cleanMarkdownText(parsed.subtitle || plan.subtitle || '');

        let rawBullets: string[] = Array.isArray(parsed.bullets) && parsed.bullets.length > 0
          ? parsed.bullets
          : plan.bullets;

        const cleanedBullets = SlideExporter.sanitizeBullets(rawBullets, cleanTitle);

        const slideContent: SlideContent = {
          title: cleanTitle,
          subtitle: cleanSubtitle,
          bullets: cleanedBullets,
          notes: parsed.notes || plan.notes,
          layout: (parsed.layout || plan.layout) as any,
        };

        return slideContent;
      }
    } catch (e) {
      log.warn('Failed to parse LLM response as JSON');
    }

    return this.generateTemplateContent(plan);
  }

  private parseOutlineResponse(response: string): SlidePlan[] {
    try {
      // Strip markdown code fences if present
      let cleaned = response.trim();
      cleaned = cleaned.replace(/```json\s*/gi, '').replace(/```\s*/g, '');

      // Try to find JSON array
      const arrayMatch = cleaned.match(/\[[\s\S]*?\]/);
      if (arrayMatch) {
        const parsed = JSON.parse(arrayMatch[0]);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.filter((item: any) => item && typeof item === 'object')
            .map((item: any) => {
              const title = SlideExporter.cleanMarkdownText(item.title || item.slide_title || 'Untitled Slide');
              return {
                title,
                layout: item.layout || 'title-bullets',
                bullets: SlideExporter.sanitizeBullets(
                  Array.isArray(item.bullets) ? item.bullets :
                    Array.isArray(item.points) ? item.points : [],
                  title
                ),
                subtitle: SlideExporter.cleanMarkdownText(item.subtitle || ''),
              };
            });
        }
      }

      // Try single object (LLM might return one slide instead of array)
      const objMatch = cleaned.match(/\{[\s\S]*?\}/);
      if (objMatch) {
        const parsed = JSON.parse(objMatch[0]);
        if (parsed && typeof parsed === 'object' && (parsed.title || parsed.slide_title)) {
          const title = SlideExporter.cleanMarkdownText(parsed.title || parsed.slide_title);
          return [{
            title,
            layout: parsed.layout || 'title-bullets',
            bullets: SlideExporter.sanitizeBullets(
              Array.isArray(parsed.bullets) ? parsed.bullets :
                Array.isArray(parsed.points) ? parsed.points : [],
              title
            ),
            subtitle: SlideExporter.cleanMarkdownText(parsed.subtitle || ''),
          }];
        }
      }
    } catch (e) {
      log.warn('Failed to parse outline response', { error: e instanceof Error ? e.message : String(e), responsePreview: response.substring(0, 300) });
    }

    return [];
  }

  private generateFallbackBullets(title: string): string[] {
    const isAgenda = /mục lục|agenda|tổng quan|overview|nội dung/i.test(title);
    if (isAgenda) {
      return [
        '**Tổng quan chương trình**: Đặt vấn đề và mục tiêu chính của dự án',
        '**Phân tích giải pháp**: Chi tiết các thành phần kiến trúc và mô hình hoạt động',
        '**Đánh giá & Kết luận**: Tóm tắt kết quả đạt được và bài học kinh nghiệm',
      ];
    }
    return [
      `**Tổng quan**: Phân tích chi tiết và đánh giá toàn diện về ${title}`,
      '**Giải pháp kỹ thuật**: Tối ưu hóa và nâng cao hiệu năng, độ tin cậy hệ thống',
      '**Định hướng triển khai**: Quy trình triển khai chuẩn hóa và kế hoạch tiếp theo',
    ];
  }

  /**
   * Enhanced fallback: uses plan's bullets directly when LLM is unavailable.
   * Plan bullets come from outline LLM call or chunk extraction.
   */
  private generateEnhancedFallback(plan: SlidePlan): SlideContent {
    const rawBullets = plan.bullets.length > 0
      ? plan.bullets.slice(0, 7)
      : this.generateFallbackBullets(plan.title);

    const bullets = SlideExporter.sanitizeBullets(rawBullets, plan.title);

    return {
      title: plan.title,
      subtitle: plan.subtitle || '',
      bullets,
      notes: plan.notes || `Speaker notes for: ${plan.title}`,
      layout: plan.layout,
    };
  }

  private generateTemplateContent(plan: SlidePlan): SlideContent {
    const rawBullets = plan.bullets.length > 0 ? plan.bullets : this.generateFallbackBullets(plan.title);
    const bullets = SlideExporter.sanitizeBullets(rawBullets, plan.title);

    return {
      title: plan.title,
      subtitle: plan.subtitle,
      bullets,
      notes: plan.notes,
      layout: plan.layout,
    };
  }

  private generateDefaultOutline(topic: string): SlidePlan[] {
    return [
      {
        title: topic.substring(0, 60),
        layout: 'title',
        bullets: [],
        subtitle: 'Presentation',
      },
      {
        title: 'Overview',
        layout: 'title-bullets',
        bullets: ['What we will cover', 'Key objectives', 'Expected outcomes'],
      },
      {
        title: 'Main Content',
        layout: 'title-bullets',
        bullets: ['Key point 1', 'Key point 2', 'Key point 3', 'Key point 4'],
      },
      {
        title: 'Details',
        layout: 'title-bullets',
        bullets: ['Detailed analysis', 'Supporting data', 'Case studies'],
      },
      {
        title: 'Summary & Next Steps',
        layout: 'title-bullets',
        bullets: ['Key takeaways', 'Action items', 'Timeline'],
      },
      {
        title: 'Thank You',
        layout: 'title',
        bullets: [],
        subtitle: 'Questions & Discussion',
      },
    ];
  }
}