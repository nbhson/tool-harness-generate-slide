import { SlideContent, SlideLayout, SlideTable, TimelineItem, Flowchart, InfographicElement, StatItem, FAQItem, TestimonialItem, PricingItem, CodeBlock, VideoEmbed, SlideImage, SlideChart } from '../../schemas/slide.schema';
import { logger } from '../../utils/logger';
import { generateId } from '../../utils/helpers';
import { TextChunker, TextChunk } from '../../utils/textChunker';
import { ConcurrencyPool } from '../../utils/concurrency';
import { CircuitBreaker } from '../../utils/circuitBreaker';
import { RequestCoalescer } from '../../utils/requestCoalescer';
import { SlideExporter } from './slideExporter';

// Polyfill for global fetch in Node.js environments
import fetch from 'node-fetch';
if (!globalThis.fetch) {
  globalThis.fetch = fetch as any;
}

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

  constructor(config: ContentGeneratorConfig) {
    this.config = config;
    this.chunker = new TextChunker({ maxChunkSize: 1500, minChunkSize: 200 });
    this.circuitBreaker = new CircuitBreaker('LLM', {
      failureThreshold: 3,
      resetTimeoutMs: 30_000,
      halfOpenSuccessThreshold: 2,
    });
    this.coalescer = new RequestCoalescer(60_000);
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

    // Chunk prompts may overuse title-bullets. Enforce a useful visual mix for
    // long source documents so charts/tables/images actually reach the exporter.
    return this.ensureOutlineVisualVariety(allPlans);
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

Respond ONLY with a JSON array (no explanation). Select the layout best suited
to the content from: title-bullets, two-column, comparison, chart, table,
timeline, flowchart, stats, image-grid, code.
[{"title":"Slide title","layout":"chart","bullets":["**Key Header**: Thorough, detailed explanation point with deep technical context..."]}]

Rules:
- 7-10 comprehensive bullets per slide, 150-300 words each
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
    "layout": "title | title-bullets | two-column | comparison | section-break | chart | quote | table | timeline | flowchart | infographic | stats | image-grid | video | code | faq | testimonial | pricing",
    "bullets": ["**Specific Header 1**: Comprehensive, detailed explanation with context, data, or action items (30-50 words)", "**Specific Header 2**: Comprehensive, detailed explanation with context, data, or action items (30-50 words)"],
    "subtitle": "Informative, context-rich subtitle"
  }
]

Rules:
- Slide 1 must be 'title' layout.
- Include visual variety: mix title-bullets, two-column, comparison, section-break, quote, chart, timeline, flowchart, infographic, stats, image-grid, video, code, faq, testimonial, and pricing layouts.
- Final slide should be conclusion/thank-you (layout: 'title').
- Write content in the same language as the topic (e.g., Vietnamese if topic is in Vietnamese).
- Each bullet MUST start with a real topic header like \`**Thực tế thị trường**: Chi tiết...\`.
- NEVER use generic headers like "Điểm quan trọng 1", "Point 1", "Mục 1".
- NEVER use ASCII box drawing characters (┌, ─, │, └) or pipe table characters (|).`;
    return prompt;
  }

  private buildContentPrompt(context: string, plan: SlidePlan): string {
    const layoutInstructions: Record<string, string> = {
      'title': 'Create a high-impact main title and an engaging, informative subtitle. Leave bullets array empty. Respond with: {title, subtitle}',
      'title-bullets': 'Provide 5-7 rich, highly detailed bullet points. EVERY bullet MUST start with a bold key concept header: "**Header**: Thorough explanation with specific technical context, mechanisms, background, or action items (30-60 words per point)".',
      'two-column': 'Provide 4-6 detailed bullet points structured as two pairs of contrasting or complementary concepts. Format: "**Concept**: Deep, complete explanation (30-50 words)".',
      'comparison': 'Provide 4-6 detailed bullet points comparing options, solutions, or before/after states. Format: "**Option A / Pros**: Deep, detailed comparative analysis (30-50 words)".',
      'section-break': 'Provide a bold section title and a brief motivational or summary subtitle. Leave bullets array empty or 2-3 detailed highlights.',
      'quote': 'Provide an impactful quote as the title or subtitle. Place author or source attribution in subtitle or notes.',
      'chart': 'MUST provide chart object with type, data array, title, labels, and colors. Include 4-5 key data insights in bullets array starting with bold metrics: "**Metric (+45%)**: Detailed analytical summary".',
      'table': 'MUST provide table object with headers and rows arrays. Include explanatory bullets describing key insights from the table data.',
      'timeline': 'MUST provide timeline array with date, title, description, and optional icon for each milestone. Format: [{date: "YYYY-MM-DD", title: "Milestone", description: "Detailed description", icon: "calendar"}]',
      'flowchart': 'MUST provide flowchart object with nodes and edges arrays. Nodes must have id, label, and type (start/end/process/decision/input/output). Edges must have from, to, and optional label. Direction can be horizontal or vertical.',
      'infographic': 'MUST provide infographic array with elements containing type (header/text/image/chart/icon/stat), content, position (x,y,width,height), and optional style. Create a visually balanced composition.',
      'stats': 'MUST provide stats array with value, label, optional icon and color for each statistic. Format: [{value: "45%", label: "Growth Rate", icon: "trending-up", color: "#22c55e"}]',
      'image-grid': 'MUST provide imageGrid array with image objects containing url or base64, alt text, and optional position. Include bullets describing each image.',
      'video': 'MUST provide video object with url, type (youtube/vimeo/mp4/webm), optional title, poster, autoplay, and controls. Include bullets describing video content and key takeaways.',
      'code': 'MUST provide code object with language, code content, optional title, and lineNumbers. Include bullets explaining the code and its significance.',
      'faq': 'MUST provide faq array with question and answer pairs. Format: [{question: "Frequent question", answer: "Detailed answer (30-50 words)"}]',
      'testimonial': 'MUST provide testimonials array with quote, author, optional title, company, and avatar. Format: [{quote: "Customer quote", author: "Name", title: "Position", company: "Company", avatar: "url"}]',
      'pricing': 'MUST provide pricing array with name, price, period, features, highlighted, and buttonText. Format: [{name: "Plan Name", price: "$99", period: "/month", features: ["Feature 1", "Feature 2"], highlighted: true, buttonText: "Get Started"}]',
    };

    const layoutGuide = layoutInstructions[plan.layout] || 'Provide 5-7 clear bullet points starting with bold lead-in headers: "**Header**: Thorough, in-depth explanation (30-50 words)".';
    
    // Get concrete example for visual layouts
    const example = this.getLayoutExample(plan.layout);

    return `You are an executive presentation content architect. Generate deep, comprehensive slide content based on the context and plan below.

CONTEXT:
${context}

SLIDE PLAN:
- Title: ${plan.title}
- Layout: ${plan.layout}
- Key points: ${plan.bullets.join('; ')}

LAYOUT SPECIFIC INSTRUCTION:
${layoutGuide}
${example}

Respond strictly in valid JSON format. Include ALL relevant fields for the specified layout:
{
  "title": "slide title",
  "subtitle": "informative context-rich subtitle",
  "bullets": [
    "**Specific Concept 1**: Comprehensive, thorough explanation sentence providing deep technical background, practical context, and actionable takeaways...",
    "**Specific Concept 2**: Comprehensive, thorough explanation sentence providing deep technical background, practical context, and actionable takeaways..."
  ],
  "notes": "Detailed, comprehensive speaker notes (100-150 words) covering key discussion points, background rationale, and presentation guidance."
  ${this.getLayoutSpecificFields(plan.layout)}
}

Formatting & Quality Rules:
1. EVERY bullet MUST start with a bold lead-in header formatted as \`**Key Concept**: Full detailed explanation\`.
2. NEVER use generic headers like "Điểm quan trọng 1", "Điểm quan trọng 2", "Mục 1", "Point 1". Always use real topic concepts.
3. NEVER output ASCII box drawing characters (┌, ─, │, └, ┘, ┼) or raw pipe borders (|).
4. Provide DEEP, THOROUGH, and COMPLETE text information for each point (aim for 30-60 words per bullet point). NEVER generate brief 5-10 word fragments.
5. Include 5-7 detailed bullet points for content slides.
6. Match the EXACT language of the topic/context (e.g., Vietnamese if context is Vietnamese).
7. Never output raw markdown code fences or raw text outside the JSON.
8. For visual layouts (chart, table, timeline, flowchart, infographic, stats, image-grid, video, code, faq, testimonial, pricing), you MUST include the corresponding data structure - this is MANDATORY.`;
  }

  private getLayoutSpecificFields(layout: SlideLayout): string {
    const fields: Record<string, string> = {
      'chart': ', "chart": {type, data, title, labels, colors}',
      'table': ', "table": {headers: [], rows: []}',
      'timeline': ', "timeline": [{date, title, description, icon}]',
      'flowchart': ', "flowchart": {nodes: [], edges: [], direction}',
      'infographic': ', "infographic": [{type, content, position, style}]',
      'stats': ', "stats": [{value, label, icon, color}]',
      'image-grid': ', "imageGrid": [{url, base64, alt, position}]',
      'video': ', "video": {url, type, title, poster, autoplay, controls}',
      'code': ', "code": {language, code, title, lineNumbers}',
      'faq': ', "faq": [{question, answer}]',
      'testimonial': ', "testimonials": [{quote, author, title, company, avatar}]',
      'pricing': ', "pricing": [{name, price, period, features, highlighted, buttonText}]',
    };
    return fields[layout] || '';
  }

  /**
   * Provide concrete examples for visual layouts to help LLM understand the exact structure
   */
  private getLayoutExample(layout: SlideLayout): string {
    const examples: Record<string, string> = {
      'chart': `
EXAMPLE OUTPUT for chart layout:
{
  "title": "Revenue Analysis",
  "subtitle": "Q1-Q4 Performance",
  "chart": {
    "type": "bar",
    "data": [
      {"label": "Q1", "value": 45},
      {"label": "Q2", "value": 67},
      {"label": "Q3", "value": 82},
      {"label": "Q4", "value": 95}
    ],
    "title": "Quarterly Revenue Growth",
    "labels": ["Q1", "Q2", "Q3", "Q4"],
    "colors": ["#3B82F6", "#10B981", "#F59E0B", "#EF4444"]
  },
  "bullets": [
    "**Growth Trend**: Revenue increased by 48% from Q1 to Q4, driven by market expansion and product launches",
    "**Peak Performance**: Q4 achieved highest revenue at $95M, exceeding targets by 15%"
  ]
}`,
      'stats': `
EXAMPLE OUTPUT for stats layout:
{
  "title": "Key Performance Metrics",
  "stats": [
    {"value": "99.9%", "label": "System Uptime", "icon": "check-circle", "color": "#10B981"},
    {"value": "45%", "label": "Growth Rate", "icon": "trending-up", "color": "#3B82F6"},
    {"value": "<100ms", "label": "Response Time", "icon": "clock", "color": "#F59E0B"},
    {"value": "10K+", "label": "Active Users", "icon": "users", "color": "#EF4444"}
  ],
  "bullets": [
    "**Reliability**: System maintains 99.9% uptime with robust failover mechanisms",
    "**Performance**: Average response time under 100ms ensures optimal user experience"
  ]
}`,
      'timeline': `
EXAMPLE OUTPUT for timeline layout:
{
  "title": "Project Roadmap",
  "timeline": [
    {"date": "2024-01", "title": "Project Kickoff", "description": "Initial planning and requirements analysis phase", "icon": "calendar"},
    {"date": "2024-04", "title": "Development", "description": "Core feature implementation and testing", "icon": "code"},
    {"date": "2024-07", "title": "Launch", "description": "Public release and marketing campaign", "icon": "rocket"},
    {"date": "2024-10", "title": "Optimization", "description": "Performance tuning and feature enhancements", "icon": "trending-up"}
  ],
  "bullets": [
    "**Phase 1-2**: Foundation and development completed on schedule with all milestones achieved",
    "**Phase 3-4**: Launch successful, optimization ongoing with 45% performance improvement"
  ]
}`,
      'table': `
EXAMPLE OUTPUT for table layout:
{
  "title": "Technical Comparison",
  "table": {
    "headers": ["Feature", "Current", "Proposed", "Improvement"],
    "rows": [
      ["Performance", "250ms", "85ms", "+66%"],
      ["Reliability", "99.5%", "99.9%", "+0.4%"],
      ["Cost", "$5000/mo", "$3500/mo", "-30%"]
    ]
  },
  "bullets": [
    "**Performance Gains**: Proposed solution delivers 66% faster response times through optimized architecture",
    "**Cost Efficiency**: 30% reduction in operational costs while improving reliability metrics"
  ]
}`,
      'flowchart': `
EXAMPLE OUTPUT for flowchart layout:
{
  "title": "Process Flow",
  "flowchart": {
    "nodes": [
      {"id": "start", "label": "Start", "type": "start"},
      {"id": "input", "label": "Receive Request", "type": "input"},
      {"id": "validate", "label": "Validate Data", "type": "decision"},
      {"id": "process", "label": "Process Request", "type": "process"},
      {"id": "output", "label": "Send Response", "type": "output"},
      {"id": "end", "label": "End", "type": "end"}
    ],
    "edges": [
      {"from": "start", "to": "input"},
      {"from": "input", "to": "validate"},
      {"from": "validate", "to": "process", "label": "Valid"},
      {"from": "validate", "to": "end", "label": "Invalid"},
      {"from": "process", "to": "output"},
      {"from": "output", "to": "end"}
    ],
    "direction": "vertical"
  },
  "bullets": [
    "**Validation Layer**: Input validation prevents 95% of invalid requests before processing",
    "**Error Handling**: Robust error paths ensure graceful degradation and user feedback"
  ]
}`,
    };
    
    return examples[layout] || '';
  }

  private async callLLM(prompt: string, onStreamChunk?: (chunk: string) => void): Promise<string> {
    // Execute through circuit breaker + request coalescing (NO CACHE)
    const requestKey = `${prompt.substring(0, 50)}-${Date.now()}`;
    return this.coalescer.deduplicate(requestKey, () =>
      this.circuitBreaker.execute(
        () => this.executeLLMRequest(prompt, undefined, onStreamChunk),
        async () => {
          // Circuit open: try fallback model directly
          log.info('Circuit open, trying fallback model directly');
          return this.executeLLMRequest(prompt, this.config.fallbackModel, onStreamChunk);
        }
      )
    );
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

    let response: any;
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
  private async extractContent(response: any, onStreamChunk?: (chunk: string) => void): Promise<string> {
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
          layout: (parsed.layout || plan.layout) as SlideLayout,
        };

        // Parse layout-specific data
        if (parsed.chart) {
          (slideContent as any).chart = this.parseChart(parsed.chart);
        }
        if (parsed.table) {
          (slideContent as any).table = this.parseTable(parsed.table);
        }
        if (parsed.timeline) {
          slideContent.timeline = this.parseTimeline(parsed.timeline);
        }
        if (parsed.flowchart) {
          slideContent.flowchart = this.parseFlowchart(parsed.flowchart);
        }
        if (parsed.infographic) {
          slideContent.infographic = this.parseInfographic(parsed.infographic);
        }
        if (parsed.stats) {
          slideContent.stats = this.parseStats(parsed.stats);
        }
        if (parsed.faq) {
          slideContent.faq = this.parseFAQ(parsed.faq);
        }
        if (parsed.testimonials) {
          slideContent.testimonials = this.parseTestimonials(parsed.testimonials);
        }
        if (parsed.pricing) {
          slideContent.pricing = this.parsePricing(parsed.pricing);
        }
        if (parsed.code) {
          slideContent.code = this.parseCode(parsed.code);
        }
        if (parsed.video) {
          slideContent.video = this.parseVideo(parsed.video);
        }
        if (parsed.imageGrid) {
          slideContent.imageGrid = this.parseImageGrid(parsed.imageGrid);
        }
        if (parsed.visuals) {
          slideContent.visuals = parsed.visuals;
        }

        // PART 2 OF SOLUTION: Force inject fallback visual data if LLM didn't provide it
        this.ensureVisualData(slideContent, plan.layout, plan.title);

        return slideContent;
      }
    } catch (e) {
      log.warn('Failed to parse LLM response as JSON', { error: e instanceof Error ? e.message : String(e) });
    }

    return this.generateTemplateContent(plan);
  }

  private parseChart(data: any): SlideChart {
    return {
      type: (data.type || 'bar') as any,
      data: data.data || [],
      title: data.title,
      labels: data.labels,
      colors: data.colors,
    };
  }

  private parseTable(data: any): { headers: string[]; rows: string[][]; title?: string } {
    return {
      headers: data.headers || [],
      rows: data.rows || [],
      title: data.title,
    };
  }

  private parseTimeline(data: any): TimelineItem[] {
    if (!Array.isArray(data)) return [];
    return data.map((item: any) => ({
      date: item.date || '',
      title: item.title || '',
      description: item.description || '',
      icon: item.icon,
    }));
  }

  private parseFlowchart(data: any): Flowchart {
    return {
      nodes: (data.nodes || []).map((n: any) => ({
        id: n.id || '',
        label: n.label || '',
        type: n.type,
        x: n.x,
        y: n.y,
      })),
      edges: (data.edges || []).map((e: any) => ({
        from: e.from || '',
        to: e.to || '',
        label: e.label,
      })),
      direction: data.direction,
    };
  }

  private parseInfographic(data: any): InfographicElement[] {
    if (!Array.isArray(data)) return [];
    return data.map((item: any) => ({
      type: item.type || 'text',
      content: item.content || '',
      position: item.position || { x: 0, y: 0, width: 100, height: 50 },
      style: item.style,
    }));
  }

  private parseStats(data: any): StatItem[] {
    if (!Array.isArray(data)) return [];
    return data.map((item: any) => ({
      value: item.value || '',
      label: item.label || '',
      icon: item.icon,
      color: item.color,
    }));
  }

  private parseFAQ(data: any): FAQItem[] {
    if (!Array.isArray(data)) return [];
    return data.map((item: any) => ({
      question: item.question || '',
      answer: item.answer || '',
    }));
  }

  private parseTestimonials(data: any): TestimonialItem[] {
    if (!Array.isArray(data)) return [];
    return data.map((item: any) => ({
      quote: item.quote || '',
      author: item.author || '',
      title: item.title,
      company: item.company,
      avatar: item.avatar,
    }));
  }

  private parsePricing(data: any): PricingItem[] {
    if (!Array.isArray(data)) return [];
    return data.map((item: any) => ({
      name: item.name || '',
      price: item.price || '',
      period: item.period,
      features: item.features || [],
      highlighted: item.highlighted || false,
      buttonText: item.buttonText || 'Get Started',
    }));
  }

  private parseCode(data: any): CodeBlock {
    return {
      language: data.language || 'javascript',
      code: data.code || '',
      title: data.title,
      lineNumbers: data.lineNumbers || true,
    };
  }

  private parseVideo(data: any): VideoEmbed {
    return {
      url: data.url || '',
      type: (data.type || 'youtube') as any,
      title: data.title,
      poster: data.poster,
      autoplay: data.autoplay || false,
      controls: data.controls !== false,
    };
  }

  private parseImageGrid(data: any): SlideImage[] {
    if (!Array.isArray(data)) return [];
    return data.map((item: any) => ({
      url: item.url,
      base64: item.base64,
      alt: item.alt || '',
      position: item.position,
    }));
  }

  private parseOutlineResponse(response: string): SlidePlan[] {
    try {
      // Strip markdown code fences if present
      let cleaned = response.trim();
      cleaned = cleaned.replace(/```json\s*/gi, '').replace(/```\s*/g, '');

      // Try to find JSON array
      const arrayJson = this.extractBalancedJson(cleaned, '[', ']');
      if (arrayJson) {
        const parsed = JSON.parse(arrayJson);
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
      const objectJson = this.extractBalancedJson(cleaned, '{', '}');
      if (objectJson) {
        const parsed = JSON.parse(objectJson);
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

  /** Extract a complete JSON array/object while respecting nesting and strings. */
  private extractBalancedJson(text: string, open: '[' | '{', close: ']' | '}'): string | undefined {
    const start = text.indexOf(open);
    if (start < 0) return undefined;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
      const char = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') inString = true;
      else if (char === open) depth++;
      else if (char === close && --depth === 0) return text.slice(start, i + 1);
    }
    return undefined;
  }

  /** Guarantee data-driven and visual slides without changing title slides. */
  private ensureOutlineVisualVariety(plans: SlidePlan[]): SlidePlan[] {
    if (plans.length < 6) return plans;
    const result = plans.map(plan => ({ ...plan }));
    const desired: SlideLayout[] = ['stats', 'image-grid', 'table', 'flowchart', 'chart', 'timeline'];
    const candidates = result
      .map((plan, index) => ({ plan, index }))
      .filter(({ plan, index }) => index > 0 && plan.layout !== 'title' && plan.layout !== 'section-break');

    desired.forEach((layout, slot) => {
      const candidate = candidates[Math.floor((slot + 1) * candidates.length / (desired.length + 1))];
      if (candidate) candidate.plan.layout = layout;
    });
    return result;
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

    const content: SlideContent = {
      title: plan.title,
      subtitle: plan.subtitle || '',
      bullets,
      notes: plan.notes || `Speaker notes for: ${plan.title}`,
      layout: plan.layout,
    };

    // Add fallback data for special layouts
    this.addLayoutFallbackData(content, plan.layout, plan.title);

    return content;
  }

  private generateTemplateContent(plan: SlidePlan): SlideContent {
    const rawBullets = plan.bullets.length > 0 ? plan.bullets : this.generateFallbackBullets(plan.title);
    const bullets = SlideExporter.sanitizeBullets(rawBullets, plan.title);

    const content: SlideContent = {
      title: plan.title,
      subtitle: plan.subtitle,
      bullets,
      notes: plan.notes,
      layout: plan.layout,
    };

    // Add fallback data for special layouts
    this.addLayoutFallbackData(content, plan.layout, plan.title);

    return content;
  }

  /**
   * PART 2 OF SOLUTION: Ensure visual data exists for visual layouts
   * If LLM didn't provide the required visual data structure, inject fallback data
   */
  private ensureVisualData(content: SlideContent, layout: SlideLayout, title: string): void {
    const visualLayouts = ['chart', 'table', 'timeline', 'flowchart', 'infographic', 'stats', 
                           'image-grid', 'video', 'code', 'faq', 'testimonial', 'pricing'];
    
    if (!visualLayouts.includes(layout)) {
      return; // Not a visual layout, skip
    }

    let needsFallback = false;

    // Check if visual data is missing for the specific layout
    switch (layout) {
      case 'chart':
        if (!(content as any).chart || !(content as any).chart.data || (content as any).chart.data.length === 0) {
          needsFallback = true;
          log.warn(`Chart layout missing chart data for slide "${title}", injecting fallback`);
        }
        break;
      case 'table':
        if (!(content as any).table || !(content as any).table.rows || (content as any).table.rows.length === 0) {
          needsFallback = true;
          log.warn(`Table layout missing table data for slide "${title}", injecting fallback`);
        }
        break;
      case 'timeline':
        if (!content.timeline || content.timeline.length === 0) {
          needsFallback = true;
          log.warn(`Timeline layout missing timeline data for slide "${title}", injecting fallback`);
        }
        break;
      case 'flowchart':
        if (!content.flowchart || !content.flowchart.nodes || content.flowchart.nodes.length === 0) {
          needsFallback = true;
          log.warn(`Flowchart layout missing flowchart data for slide "${title}", injecting fallback`);
        }
        break;
      case 'infographic':
        if (!content.infographic || content.infographic.length === 0) {
          needsFallback = true;
          log.warn(`Infographic layout missing infographic data for slide "${title}", injecting fallback`);
        }
        break;
      case 'stats':
        if (!content.stats || content.stats.length === 0) {
          needsFallback = true;
          log.warn(`Stats layout missing stats data for slide "${title}", injecting fallback`);
        }
        break;
      case 'image-grid':
        if (!content.imageGrid || content.imageGrid.length === 0) {
          needsFallback = true;
          log.warn(`Image-grid layout missing imageGrid data for slide "${title}", injecting fallback`);
        }
        break;
      case 'video':
        if (!content.video || !content.video.url) {
          needsFallback = true;
          log.warn(`Video layout missing video data for slide "${title}", injecting fallback`);
        }
        break;
      case 'code':
        if (!content.code || !content.code.code) {
          needsFallback = true;
          log.warn(`Code layout missing code data for slide "${title}", injecting fallback`);
        }
        break;
      case 'faq':
        if (!content.faq || content.faq.length === 0) {
          needsFallback = true;
          log.warn(`FAQ layout missing faq data for slide "${title}", injecting fallback`);
        }
        break;
      case 'testimonial':
        if (!content.testimonials || content.testimonials.length === 0) {
          needsFallback = true;
          log.warn(`Testimonial layout missing testimonials data for slide "${title}", injecting fallback`);
        }
        break;
      case 'pricing':
        if (!content.pricing || content.pricing.length === 0) {
          needsFallback = true;
          log.warn(`Pricing layout missing pricing data for slide "${title}", injecting fallback`);
        }
        break;
    }

    // Inject fallback data if needed
    if (needsFallback) {
      this.addLayoutFallbackData(content, layout, title);
    }
  }

  /**
   * Derive a deterministic numeric seed from a string (0-99).
   * Used to vary fallback visual data per slide title.
   */
  private seedFromTitle(title: string): number {
    let hash = 0;
    for (let i = 0; i < title.length; i++) {
      const chr = title.charCodeAt(i);
      hash = ((hash << 5) - hash) + chr;
      hash |= 0; // Convert to 32bit integer
    }
    return ((Math.abs(hash) * 13 + 7) % 100);
  }

  /**
   * Pick an item from an array based on a seed (cycle-safe).
   */
  private pickVariation<T>(items: T[], seed: number, offset: number = 0): T {
    return items[(seed + offset) % items.length];
  }

  /**
   * Generate a set of numeric values for fallback charts based on a title seed.
   * Produces different patterns so not every fallback chart looks the same.
   */
  private generateChartValues(seed: number): number[] {
    const baseSet = [
      [45, 67, 82, 95],
      [30, 55, 70, 90],
      [85, 72, 60, 45],
      [20, 45, 65, 88],
      [60, 45, 75, 55],
      [92, 78, 85, 97],
      [15, 35, 50, 78],
      [40, 60, 80, 60],
      [70, 65, 90, 85],
      [55, 80, 40, 70],
      [33, 47, 62, 76],
      [25, 50, 38, 65],
    ];
    return baseSet[seed % baseSet.length];
  }

  /**
   * Pick a chart type based on title keywords and seed.
   */
  private pickChartType(title: string, seed: number): 'bar' | 'line' | 'pie' | 'area' | 'doughnut' | 'radar' | 'scatter' {
    if (/trend|growth|progress|increase|tăng|phát triển|growth rate/i.test(title)) return 'line';
    if (/distribution|share|split|phân bổ|tỷ lệ|composition/i.test(title)) return 'pie';
    if (/compare|comparison|so sánh|đối chiếu|versus|vs/i.test(title)) return 'bar';
    if (/over time|history|history|timeline|progress|theo thời gian/i.test(title)) return 'area';
    if (/radar|skill|competency|assessment|kỹ năng|đánh giá/i.test(title)) return 'radar';
    if (/breakdown|revenue|sales|doanh thu|budget|ngân sách/i.test(title)) return 'doughnut';
    const types: ('bar' | 'line' | 'pie' | 'area' | 'doughnut' | 'radar' | 'scatter')[] = ['bar', 'bar', 'line', 'pie', 'area', 'doughnut'];
    return types[seed % types.length];
  }

  /**
   * Add fallback data for special layouts when LLM doesn't provide specific content.
   * Data varies based on the slide title to avoid every fallback looking identical.
   */
  private addLayoutFallbackData(content: SlideContent, layout: SlideLayout, title: string): void {
    const isVietnamese = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(title);
    const seed = this.seedFromTitle(title);
    const val = this.generateChartValues(seed);

    switch (layout) {
      case 'chart':
        (content as any).chart = {
          type: this.pickChartType(title, seed),
          data: [
            { label: isVietnamese ? 'Q.1' : 'Q1', value: val[0], target: val[0] - 10 },
            { label: isVietnamese ? 'Q.2' : 'Q2', value: val[1], target: val[1] - 8 },
            { label: isVietnamese ? 'Q.3' : 'Q3', value: val[2], target: val[2] - 12 },
            { label: isVietnamese ? 'Q.4' : 'Q4', value: val[3], target: val[3] - 5 },
            { label: isVietnamese ? 'C.Năm' : 'Year', value: val.reduce((a, b) => a + b) / 4, target: val.reduce((a, b) => a + b) / 5 },
          ],
          title: title.substring(0, 50),
          labels: [isVietnamese ? 'Q.1' : 'Q1', isVietnamese ? 'Q.2' : 'Q2', isVietnamese ? 'Q.3' : 'Q3', isVietnamese ? 'Q.4' : 'Q4', isVietnamese ? 'Tổng' : 'Total'],
          colors: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'],
        };
        break;

      case 'table':
        (content as any).table = {
          headers: isVietnamese
            ? ['STT', 'Tiêu chí', 'Giá trị']
            : ['No.', 'Criteria', 'Value'],
          rows: [
            ['1', isVietnamese ? 'Chỉ số A' : `Metric ${seed % 20 + 1}`, `${val[0]}%`],
            ['2', isVietnamese ? 'Chỉ số B' : `Metric ${seed % 20 + 2}`, `${val[1]}%`],
            ['3', isVietnamese ? 'Chỉ số C' : `Metric ${seed % 20 + 3}`, `${val[2]}%`],
            ['4', isVietnamese ? 'Chỉ số D' : `Metric ${seed % 20 + 4}`, `${val[3]}%`],
          ],
          title: title.substring(0, 50),
        };
        break;

      case 'timeline':
        content.timeline = [
          {
            date: `${2023 + Math.floor(seed / 25)}-0${(seed % 3) + 1}`,
            title: isVietnamese ? `Giai đoạn ${seed % 4 + 1}` : `Phase ${seed % 4 + 1}`,
            description: title.length > 20 ? `${title.substring(0, 40)} — initial phase` : 'Initial research and planning phase',
            icon: 'calendar',
          },
          {
            date: `${2023 + Math.floor(seed / 25)}-0${(seed % 3) + 4}`,
            title: isVietnamese ? `Phát triển ${seed % 4 + 1}` : `Development ${seed % 4 + 1}`,
            description: isVietnamese ? 'Xây dựng và phát triển các tính năng cốt lõi' : 'Building and developing core features',
            icon: 'code',
          },
          {
            date: `${2023 + Math.floor(seed / 25)}-0${(seed % 3) + 7}`,
            title: isVietnamese ? `Triển khai ${seed % 4 + 1}` : `Launch ${seed % 4 + 1}`,
            description: isVietnamese ? 'Ra mắt và triển khai tới người dùng' : 'Official launch and user rollout',
            icon: 'rocket',
          },
          {
            date: `${2023 + Math.floor(seed / 25)}-1${(seed % 3)}`,
            title: isVietnamese ? `Tối ưu ${seed % 4 + 1}` : `Optimization ${seed % 4 + 1}`,
            description: isVietnamese ? `Tối ưu hóa dựa trên ${isVietnamese ? 'phản hồi' : 'feedback'} và phân tích dữ liệu` : 'Performance optimization and data-driven improvements',
            icon: 'trending-up',
          },
        ];
        break;

      case 'flowchart':
        (content as any).flowchart = {
          nodes: [
            { id: 'start', label: isVietnamese ? 'Bắt đầu' : 'Start', type: 'start' },
            { id: 'input', label: isVietnamese ? 'Nhập liệu' : 'Input Data', type: 'input' },
            { id: 'process', label: isVietnamese ? 'Xử lý' : 'Processing', type: 'process' },
            { id: 'decision', label: isVietnamese ? 'Kiểm tra' : 'Validation', type: 'decision' },
            { id: 'output', label: isVietnamese ? 'Kết quả' : 'Output', type: 'output' },
            { id: 'end', label: isVietnamese ? 'Kết thúc' : 'End', type: 'end' },
          ],
          edges: [
            { from: 'start', to: 'input', label: '' },
            { from: 'input', to: 'process', label: '' },
            { from: 'process', to: 'decision', label: '' },
            { from: 'decision', to: 'output', label: isVietnamese ? 'Hợp lệ' : 'Valid' },
            { from: 'decision', to: 'end', label: isVietnamese ? 'Không hợp lệ' : 'Invalid' },
          ],
          direction: seed % 2 === 0 ? 'vertical' : 'horizontal',
        };
        break;

      case 'infographic':
        (content as any).infographic = [
          {
            type: 'header',
            content: isVietnamese ? 'Thống kê chính' : 'Key Statistics',
            position: { x: 0, y: 0, width: 100, height: 10 },
            style: { fontSize: 24, fontWeight: 'bold', color: '#1F2937' },
          },
          {
            type: 'stat',
            content: `${val[0]}%`,
            position: { x: 10, y: 15, width: 25, height: 20 },
            style: { fontSize: 18, fontWeight: 'bold', color: '#3B82F6', backgroundColor: '#EFF6FF' },
          },
          {
            type: 'stat',
            content: `${val[1]}%`,
            position: { x: 40, y: 15, width: 25, height: 20 },
            style: { fontSize: 18, fontWeight: 'bold', color: '#10B981', backgroundColor: '#ECFDF5' },
          },
          {
            type: 'stat',
            content: `${val[2]}%`,
            position: { x: 70, y: 15, width: 25, height: 20 },
            style: { fontSize: 18, fontWeight: 'bold', color: '#F59E0B', backgroundColor: '#FFEDD5' },
          },
          {
            type: 'text',
            content: isVietnamese ? 'Tăng trưởng và hiệu suất theo thời gian' : 'Growth and performance over time',
            position: { x: 0, y: 40, width: 100, height: 8 },
            style: { fontSize: 14, color: '#6B7280' },
          },
          {
            type: 'icon',
            content: 'trending-up',
            position: { x: 0, y: 50, width: 100, height: 15 },
            style: { fontSize: 20, color: '#3B82F6' },
          },
        ];
        break;

      case 'stats':
        content.stats = [
          {
            value: `${val[0]}%`,
            label: isVietnamese ? 'Tăng trưởng' : 'Growth',
            icon: 'trending-up',
            color: seed % 2 === 0 ? '#10B981' : '#3B82F6',
          },
          {
            value: `${val[1]}+`,
            label: isVietnamese ? 'Người dùng' : 'Users',
            icon: 'users',
            color: seed % 2 === 0 ? '#3B82F6' : '#8B5CF6',
          },
          {
            value: `${val[2]}ms`,
            label: isVietnamese ? 'Đáp ứng' : 'Response Time',
            icon: 'clock',
            color: '#F59E0B',
          },
          {
            value: `${100 - (seed % 30)}%`,
            label: isVietnamese ? 'Độ tin cậy' : 'Uptime',
            icon: 'check-circle',
            color: seed % 2 === 0 ? '#EF4444' : '#10B981',
          },
        ];
        break;

      case 'image-grid':
        content.imageGrid = [
          {
            base64: this.createVisualCardDataUri(title, '#2563EB', '01'),
            alt: isVietnamese ? 'Hình ảnh 1' : 'Image 1',
            position: { x: 0, y: 0, width: 30, height: 20 },
          },
          {
            base64: this.createVisualCardDataUri(content.bullets?.[0] || title, '#059669', '02'),
            alt: isVietnamese ? 'Hình ảnh 2' : 'Image 2',
            position: { x: 35, y: 0, width: 30, height: 20 },
          },
          {
            base64: this.createVisualCardDataUri(content.bullets?.[1] || title, '#D97706', '03'),
            alt: isVietnamese ? 'Hình ảnh 3' : 'Image 3',
            position: { x: 65, y: 0, width: 30, height: 20 },
          },
        ];
        break;

      case 'video':
        content.video = {
          url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          type: 'youtube',
          title: isVietnamese ? 'Video giới thiệu' : 'Introduction Video',
          poster: 'https://via.placeholder.com/800x450/000000/FFFFFF?text=Video',
          autoplay: false,
          controls: true,
        };
        break;

      case 'code':
        content.code = {
          language: 'javascript',
          code: `// ${isVietnamese ? 'Ví dụ code' : 'Sample code'}
function ${isVietnamese ? 'tinhTong' : 'calculateSum'}(a, b) {
  return a + b;
}

const result = ${isVietnamese ? 'tinhTong' : 'calculateSum'}(5, 10);
console.log(result); // 15`,
          title: isVietnamese ? 'Ví dụ hàm tính tổng' : 'Sum Calculation Example',
          lineNumbers: true,
        };
        break;

      case 'faq':
        content.faq = [
          {
            question: isVietnamese ? 'Câu hỏi 1: Làm thế nào để bắt đầu?' : 'Q1: How do I get started?',
            answer: isVietnamese ? 'Bạn có thể bắt đầu bằng cách đăng ký tài khoản và làm theo hướng dẫn.' : 'You can start by creating an account and following the onboarding tutorial.',
          },
          {
            question: isVietnamese ? 'Câu hỏi 2: Chi phí như thế nào?' : 'Q2: What are the costs?',
            answer: isVietnamese ? 'Chúng tôi có nhiều gói khác nhau phù hợp với nhu cầu của bạn.' : 'We offer various pricing plans to suit your needs.',
          },
          {
            question: isVietnamese ? 'Câu hỏi 3: Có hỗ trợ kỹ thuật không?' : 'Q3: Is technical support available?',
            answer: isVietnamese ? 'Đội ngũ hỗ trợ của chúng tôi sẵn sàng giúp đỡ 24/7.' : 'Our support team is available 24/7 to assist you.',
          },
        ];
        break;

      case 'testimonial':
        content.testimonials = [
          {
            quote: isVietnamese ? 'Sản phẩm tuyệt vời! Đã thay đổi hoàn toàn quy trình làm việc của chúng tôi.' : 'Great product! It has completely transformed our workflow.',
            author: isVietnamese ? 'Nguyễn Văn A' : 'John Doe',
            title: isVietnamese ? 'Giám đốc kỹ thuật' : 'CTO',
            company: isVietnamese ? 'Công ty XYZ' : 'XYZ Corp',
            avatar: 'https://via.placeholder.com/100x100/3B82F6/FFFFFF?text=NA',
          },
          {
            quote: isVietnamese ? 'Dịch vụ khách hàng xuất sắc. Luôn nhận được sự hỗ trợ kịp thời.' : 'Excellent customer service. Always receive timely support.',
            author: isVietnamese ? 'Trần Thị B' : 'Jane Smith',
            title: isVietnamese ? 'Quản lý dự án' : 'Project Manager',
            company: isVietnamese ? 'Công ty ABC' : 'ABC Inc',
            avatar: 'https://via.placeholder.com/100x100/10B981/FFFFFF?text=JB',
          },
        ];
        break;

      case 'pricing':
        content.pricing = [
          {
            name: isVietnamese ? 'Gói Cơ bản' : 'Basic Plan',
            price: '$99',
            period: isVietnamese ? '/tháng' : '/month',
            features: [
              isVietnamese ? 'Tối đa 10 người dùng' : 'Up to 10 users',
              isVietnamese ? 'Hỗ trợ cơ bản' : 'Basic support',
              isVietnamese ? 'Lưu trữ 10GB' : '10GB storage',
            ],
            highlighted: false,
            buttonText: isVietnamese ? 'Đăng ký' : 'Sign Up',
          },
          {
            name: isVietnamese ? 'Gói Chuyên nghiệp' : 'Pro Plan',
            price: '$199',
            period: isVietnamese ? '/tháng' : '/month',
            features: [
              isVietnamese ? 'Tối đa 50 người dùng' : 'Up to 50 users',
              isVietnamese ? 'Hỗ trợ ưu tiên' : 'Priority support',
              isVietnamese ? 'Lưu trữ 100GB' : '100GB storage',
              isVietnamese ? 'Tích hợp API' : 'API integration',
            ],
            highlighted: true,
            buttonText: isVietnamese ? 'Đăng ký' : 'Sign Up',
          },
          {
            name: isVietnamese ? 'Gói Doanh nghiệp' : 'Enterprise Plan',
            price: '$499',
            period: isVietnamese ? '/tháng' : '/month',
            features: [
              isVietnamese ? 'Người dùng không giới hạn' : 'Unlimited users',
              isVietnamese ? 'Hỗ trợ 24/7' : '24/7 support',
              isVietnamese ? 'Lưu trữ không giới hạn' : 'Unlimited storage',
              isVietnamese ? 'Tùy chỉnh đầy đủ' : 'Full customization',
            ],
            highlighted: false,
            buttonText: isVietnamese ? 'Liên hệ' : 'Contact Us',
          },
        ];
        break;

      default:
        // For standard layouts, just ensure bullets are populated
        if (!content.bullets || content.bullets.length === 0) {
          content.bullets = this.generateFallbackBullets(title);
        }
        break;
    }
  }

  private createVisualCardDataUri(text: string, color: string, index: string): string {
    const label = SlideExporter.cleanMarkdownText(text).slice(0, 46)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="520"><rect width="800" height="520" rx="32" fill="${color}"/><circle cx="690" cy="95" r="130" fill="#fff" opacity=".12"/><text x="58" y="100" fill="#fff" opacity=".7" font-family="Arial" font-size="34">${index}</text><text x="58" y="250" fill="#fff" font-family="Arial" font-size="42" font-weight="700">${label}</text><path d="M58 330h420" stroke="#fff" stroke-width="8" opacity=".45"/><path d="M58 370h300" stroke="#fff" stroke-width="8" opacity=".25"/></svg>`;
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
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