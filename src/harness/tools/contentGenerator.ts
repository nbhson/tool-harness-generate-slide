import { SlideContent, SlideLayout } from '../../schemas/slide.schema';
import { logger } from '../../utils/logger';
import { generateId } from '../../utils/helpers';
import { TextChunker, TextChunk } from '../../utils/textChunker';
import { ConcurrencyPool } from '../../utils/concurrency';
import { CircuitBreaker } from '../../utils/circuitBreaker';
import { RequestCoalescer } from '../../utils/requestCoalescer';
import { ResponseCache } from '../memory/cache';

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

  async generateSlideContent(context: string, plan: SlidePlan): Promise<SlideContent> {
    log.info(`Generating content for slide: ${plan.title}`);

    const prompt = this.buildContentPrompt(context, plan);

    try {
      const response = await this.callLLM(prompt);
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
    // Limit content to avoid token overflow
    const content = chunk.content.substring(0, 800);
    
    return `Create ${maxSlides} presentation slides from this section.

Section: "${chunk.heading || 'Content'}"
Content:
${content}

Respond ONLY with a JSON array (no explanation):
[{"title":"Slide title","layout":"title-bullets","bullets":["point1","point2"]}]

Rules:
- Max 5 bullets per slide, max 10 words each
- Use JSON format only`;
  }

  /**
   * Extract key points from text (fallback when LLM fails)
   */
  private extractKeyPoints(text: string): string[] {
    const sentences = text.split(/[.!?\n]+/).filter(s => s.trim().length > 10);
    return sentences.slice(0, 5).map(s => s.trim());
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
    let prompt = `Create a presentation outline for: "${topic}"

${maxSlides ? `Maximum ${maxSlides} slides.` : 'Aim for 10-15 slides.'}
`;

    if (outline && outline.length > 0) {
      prompt += `\nUser-provided structure:\n${outline.map((o, i) => `${i + 1}. ${o}`).join('\n')}\n`;
    }

    prompt += `
Respond in JSON format with an array of slides:
[
  {
    "title": "Slide title",
    "layout": "title|title-bullets|two-column|section-break|chart|quote",
    "bullets": ["point 1", "point 2"],
    "subtitle": "optional subtitle"
  }
]

Rules:
- First slide should be title layout
- Include a mix of layouts for visual variety
- Last slide should be conclusion/thank-you
- Each slide should have clear, focused content`;
    return prompt;
  }

  private buildContentPrompt(context: string, plan: SlidePlan): string {
    return `You are a professional presentation designer. Generate slide content based on the following context and plan.

${context}

SLIDE PLAN:
- Title: ${plan.title}
- Layout: ${plan.layout}
- Key points: ${plan.bullets.join('; ')}

Respond in JSON format:
{
  "title": "slide title",
  "subtitle": "optional subtitle",
  "bullets": ["bullet 1", "bullet 2", ...],
  "notes": "speaker notes"
}

Rules:
- Keep bullets concise (max 15 words each)
- Max 7 bullets per slide
- Use clear, professional language
- Match the language of the topic`;
  }

  private async callLLM(prompt: string): Promise<string> {
    // Phase 5: Check cache first
    const cacheKey = ResponseCache.hash(prompt + this.config.model);
    return this.cache.getOrCompute(cacheKey, async () => {
      // Phase 9+11: Execute through circuit breaker + request coalescing
      return this.coalescer.deduplicate(cacheKey, () =>
        this.circuitBreaker.execute(
          () => this.executeLLMRequest(prompt),
          async () => {
            // Circuit open: try fallback model directly
            log.info('Circuit open, trying fallback model directly');
            return this.executeLLMRequest(prompt, this.config.fallbackModel);
          }
        )
      );
    });
  }

  private async executeLLMRequest(prompt: string, overrideModel?: string): Promise<string> {
    const url = `${this.config.baseUrl}/v1/chat/completions`;
    const model = overrideModel || this.config.model;

    log.info('Calling LLM', { url, model });

    const body = {
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 4096,
      stream: false,
    };

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
        },
        body: JSON.stringify(body),
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
            ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
          },
          body: JSON.stringify(fallbackBody),
        });

        if (!fallbackResponse.ok) {
          const fbBody = await fallbackResponse.text().catch(() => 'no body');
          throw new Error(`Both models failed. Primary: ${response.status}, Fallback: ${fallbackResponse.status} - ${fbBody}`);
        }

        return await this.extractContent(fallbackResponse);
      } catch (fbError) {
        if (fbError instanceof Error && fbError.message.startsWith('Both models')) throw fbError;
        throw new Error(`Primary: ${response.status} - ${errorBody}. Fallback error: ${fbError}`);
      }
    }

    return await this.extractContent(response);
  }

  /**
   * Extract content from LLM response.
   * Handles both JSON responses and SSE stream format.
   */
  private async extractContent(response: Response): Promise<string> {
    const text = await response.text();
    
    // Try standard JSON first
    try {
      const data = JSON.parse(text) as any;
      const content = data.choices?.[0]?.message?.content || '';
      if (content) return content;
    } catch {
      // Not JSON - might be SSE stream
    }

    // Try SSE stream format: lines like "data: {...}"
    const content = this.parseSSEStream(text);
    if (content) return content;

    throw new Error('LLM returned empty or unparseable response');
  }

  /**
   * Parse SSE (Server-Sent Events) stream response.
   * Extracts content from lines like: data: {"choices":[{"delta":{"content":"..."}}]}
   */
  private parseSSEStream(text: string): string {
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
        }
        // Non-streaming in SSE format: choices[0].message.content
        const msgContent = event.choices?.[0]?.message?.content;
        if (msgContent) {
          content += msgContent;
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
        return {
          title: parsed.title || plan.title,
          subtitle: parsed.subtitle || plan.subtitle,
          bullets: Array.isArray(parsed.bullets) ? parsed.bullets : plan.bullets,
          notes: parsed.notes || plan.notes,
          layout: plan.layout,
        };
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
            .map((item: any) => ({
              title: item.title || item.slide_title || 'Untitled Slide',
              layout: item.layout || 'title-bullets',
              bullets: Array.isArray(item.bullets) ? item.bullets : 
                       Array.isArray(item.points) ? item.points : [],
              subtitle: item.subtitle,
            }));
        }
      }

      // Try single object (LLM might return one slide instead of array)
      const objMatch = cleaned.match(/\{[\s\S]*?\}/);
      if (objMatch) {
        const parsed = JSON.parse(objMatch[0]);
        if (parsed && typeof parsed === 'object' && (parsed.title || parsed.slide_title)) {
          return [{
            title: parsed.title || parsed.slide_title,
            layout: parsed.layout || 'title-bullets',
            bullets: Array.isArray(parsed.bullets) ? parsed.bullets :
                     Array.isArray(parsed.points) ? parsed.points : [],
            subtitle: parsed.subtitle,
          }];
        }
      }
    } catch (e) {
      log.warn('Failed to parse outline response', { error: e instanceof Error ? e.message : String(e), responsePreview: response.substring(0, 300) });
    }

    return [];
  }

  /**
   * Enhanced fallback: uses plan's bullets directly when LLM is unavailable.
   * Plan bullets come from outline LLM call or chunk extraction.
   */
  private generateEnhancedFallback(plan: SlidePlan): SlideContent {
    const bullets = plan.bullets.length > 0
      ? plan.bullets.slice(0, 7)
      : ['Add your content here'];

    return {
      title: plan.title,
      subtitle: plan.subtitle || '',
      bullets,
      notes: plan.notes || `Speaker notes for: ${plan.title}`,
      layout: plan.layout,
    };
  }

  private generateTemplateContent(plan: SlidePlan): SlideContent {
    return {
      title: plan.title,
      subtitle: plan.subtitle,
      bullets: plan.bullets.length > 0 ? plan.bullets : ['Content placeholder'],
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