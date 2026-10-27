import PptxGenJS from 'pptxgenjs';
import type { Presentation } from '../../schemas/presentation.schema';
import type {
  Slide,
  SlideChart,
  SlideContent,
  SlideImage,
} from '../../schemas/slide.schema';
import { logger } from '../../utils/logger';
import { mkdirSync } from 'fs';
import { dirname, resolve } from 'path';

import { WorkerPool } from '../../utils/workerPool';

const log = logger.child('SlideExporter');

interface ThemeLayout {
  name: string;
  description?: string;
  colors: Record<string, string>;
  fonts: Record<string, string>;
  layout: {
    width?: number;
    height?: number;
    padding?: {
      top?: number;
      left?: number;
      right?: number;
      bottom?: number;
    };
    slideNumberPosition?: string;
  };
}

/** A styled text run as accepted by pptxgenjs addText(). */
type TextRun = { text: string; options: PptxGenJS.TextPropsOptions };

export class SlideExporter {
  private workerPool?: WorkerPool;

  constructor(options?: { useWorker?: boolean }) {
    if (options?.useWorker) {
      this.workerPool = new WorkerPool(2);
    }
  }

  /**
   * Map common icon names to emoji/Unicode symbols for visual rendering
   * in PPTX (which doesn't support icon fonts like Font Awesome).
   */
  public static ICON_MAP: Record<string, string> = {
    // Business & metrics
    'trending-up': '📈',
    'trending-down': '📉',
    growth: '📈',
    chart: '📊',
    'bar-chart': '📊',
    'pie-chart': '🥧',
    'line-chart': '📈',
    analytics: '📊',
    stats: '📊',
    statistics: '📊',
    report: '📋',
    dashboard: '📊',
    metric: '📏',
    target: '🎯',
    goal: '🎯',
    bullseye: '🎯',
    award: '🏆',
    trophy: '🏆',
    medal: '🏅',
    badge: '🔰',
    // Actions
    check: '✅',
    'check-circle': '✅',
    done: '✅',
    cross: '❌',
    close: '❌',
    'x-circle': '❌',
    plus: '➕',
    minus: '➖',
    download: '⬇️',
    upload: '⬆️',
    export: '📤',
    import: '📥',
    share: '🔗',
    link: '🔗',
    send: '📨',
    search: '🔍',
    zoom: '🔍',
    find: '🔎',
    settings: '⚙️',
    gear: '⚙️',
    configure: '⚙️',
    edit: '✏️',
    pencil: '✏️',
    write: '✏️',
    delete: '🗑️',
    trash: '🗑️',
    remove: '🗑️',
    lock: '🔒',
    unlock: '🔓',
    security: '🔒',
    refresh: '🔄',
    sync: '🔄',
    reload: '🔄',
    play: '▶️',
    pause: '⏸️',
    stop: '⏹️',
    // Users & people
    users: '👥',
    people: '👥',
    team: '👥',
    group: '👥',
    user: '👤',
    person: '👤',
    profile: '👤',
    customer: '🤝',
    client: '🤝',
    partner: '🤝',
    testimonial: '💬',
    feedback: '💬',
    comment: '💬',
    support: '🎧',
    headset: '🎧',
    help: '❓',
    // Tech
    code: '💻',
    coding: '💻',
    programming: '💻',
    server: '🖥️',
    database: '🗄️',
    storage: '💾',
    cloud: '☁️',
    api: '🔌',
    integration: '🔌',
    mobile: '📱',
    app: '📱',
    phone: '📞',
    email: '📧',
    mail: '📧',
    message: '💬',
    notification: '🔔',
    bell: '🔔',
    alert: '🔔',
    globe: '🌐',
    web: '🌐',
    internet: '🌐',
    github: '🐙',
    git: '🔀',
    branch: '🔀',
    // Time & schedule
    calendar: '📅',
    date: '📅',
    schedule: '📅',
    clock: '⏰',
    time: '⏰',
    timer: '⏱️',
    hourglass: '⌛',
    deadline: '⏰',
    rocket: '🚀',
    launch: '🚀',
    deploy: '🚀',
    flag: '🚩',
    milestone: '🏁',
    finish: '🏁',
    // Communication
    lightbulb: '💡',
    idea: '💡',
    innovation: '💡',
    solution: '🔧',
    tool: '🔧',
    fix: '🔧',
    star: '⭐',
    favorite: '⭐',
    rating: '⭐',
    heart: '❤️',
    like: '👍',
    'thumbs-up': '👍',
    fire: '🔥',
    hot: '🔥',
    trending: '🔥',
    info: 'ℹ️',
    information: 'ℹ️',
    warning: '⚠️',
    caution: '⚠️',
    question: '❓',
    faq: '❓',
    // Documents
    document: '📄',
    doc: '📄',
    file: '📄',
    folder: '📁',
    directory: '📁',
    presentation: '📽️',
    slide: '📑',
    note: '📝',
    notes: '📝',
    clipboard: '📋',
    list: '📋',
    bookmark: '🔖',
    tag: '🏷️',
    // Finance
    money: '💰',
    finance: '💰',
    payment: '💳',
    currency: '💲',
    dollar: '💵',
    bank: '🏦',
    wallet: '👛',
    shopping: '🛒',
    cart: '🛒',
    // Location
    location: '📍',
    pin: '📍',
    map: '🗺️',
    home: '🏠',
    office: '🏢',
    building: '🏢',
    // Misc
    palette: '🎨',
    design: '🎨',
    color: '🎨',
    education: '🎓',
    graduation: '🎓',
    learn: '📚',
    book: '📖',
    library: '📚',
    camera: '📷',
    photo: '📷',
    image: '🖼️',
    video: '🎬',
    film: '🎬',
    movie: '🎬',
    music: '🎵',
    sound: '🔊',
    volume: '🔊',
    game: '🎮',
    gaming: '🎮',
    leaf: '🍃',
    nature: '🌿',
    environment: '🌍',
    recycle: '♻️',
    sustainable: '♻️',
    truck: '🚚',
    delivery: '🚚',
    shipping: '🚚',
    airplane: '✈️',
    travel: '✈️',
    transport: '🚂',
    science: '🔬',
    lab: '🧪',
    research: '🔬',
    bulb: '💡',
    key: '🔑',
  };

  /** Fallback icon when no emoji match exists */
  public static ICON_FALLBACK = '✦';

  /**
   * Convert an icon name string to an emoji or Unicode symbol.
   * Case-insensitive matching, falls back to a diamond bullet if unknown.
   */
  public static iconToEmoji(iconName?: string): string {
    if (!iconName || typeof iconName !== 'string') return SlideExporter.ICON_FALLBACK;
    const key = iconName
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, '-') // normalize separators
      .replace(/^(icon|i)-/, ''); // strip leading "icon-" or "i-"
    return SlideExporter.ICON_MAP[key] || SlideExporter.ICON_FALLBACK;
  }

  /**
   * Helper to parse Markdown bold (**...**) and italic (*...*) strings into PPTX text runs
   */
  public static parseMarkdownToRuns(
    text: string,
    baseOpts: PptxGenJS.TextPropsOptions,
    boldColor?: string,
  ): TextRun[] {
    if (!text) return [{ text: '', options: baseOpts }];

    // Clean Markdown link syntax, broken orphan link brackets, leading bullets, and raw # headers
    const cleaned = text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\]\([^)]+\)/g, '')
      .replace(/\[/g, '')
      .replace(/^(\s*([-+•]|#+|\[\s*\]|\d+\.|\*(?!\*))\s+)+/g, '')
      .trim();

    if (!cleaned) return [{ text: '', options: baseOpts }];

    const runs: TextRun[] = [];
    const regex = /(\*\*.*?\*\*|\*.*?\*)/g;
    const parts = cleaned.split(regex);

    for (const part of parts) {
      if (!part) continue;

      if (part.startsWith('**') && part.endsWith('**')) {
        const cleanText = part.slice(2, -2);
        runs.push({
          text: cleanText,
          options: {
            ...baseOpts,
            bold: true,
            color: boldColor || baseOpts.color,
          },
        });
      } else if (part.startsWith('*') && part.endsWith('*')) {
        const cleanText = part.slice(1, -1);
        runs.push({
          text: cleanText,
          options: {
            ...baseOpts,
            italic: true,
          },
        });
      } else {
        runs.push({
          text: part,
          options: {
            ...baseOpts,
          },
        });
      }
    }

    return runs.length > 0 ? runs : [{ text: cleaned, options: baseOpts }];
  }

  async exportPPTX(presentation: Presentation, outputPath: string): Promise<string> {
    if (this.workerPool) {
      try {
        log.info('Delegating PPTX export to worker thread...');
        return await this.workerPool.run({
          type: 'export-pptx',
          data: { presentation, outputPath },
        });
      } catch (workerErr) {
        log.warn('Worker export failed, executing on main thread', { error: String(workerErr) });
      }
    }

    return this.exportPPTXDirect(presentation, outputPath);
  }

  async exportPPTXDirect(presentation: Presentation, outputPath: string): Promise<string> {
    log.info('Exporting presentation to PPTX', {
      outputPath,
      slideCount: presentation.slides.length,
    });

    const pptx = new PptxGenJS();

    pptx.author = presentation.metadata?.author || 'Slide Harness';
    pptx.title = presentation.title;
    pptx.subject = presentation.metadata?.topic || '';

    const ratio = presentation.metadata?.aspectRatio || '16:9';
    if (ratio === '16:9') {
      pptx.defineLayout({ name: 'WIDE', width: 13.33, height: 7.5 });
      pptx.layout = 'WIDE';
    } else {
      pptx.defineLayout({ name: 'STANDARD', width: 10, height: 7.5 });
      pptx.layout = 'STANDARD';
    }

    const theme = presentation.theme as unknown as ThemeLayout;

    for (let i = 0; i < presentation.slides.length; i++) {
      const slide = presentation.slides[i];
      const pptSlide = pptx.addSlide();
      this.renderSlide(pptSlide, slide, theme, i + 1, presentation.slides.length);
    }

    const absolutePath = resolve(outputPath);
    const dir = dirname(absolutePath);
    mkdirSync(dir, { recursive: true });

    await pptx.writeFile({ fileName: absolutePath });

    log.info('PPTX exported successfully', { path: absolutePath });
    return absolutePath;
  }

  private renderSlide(
    pptSlide: PptxGenJS.Slide,
    slide: Slide,
    theme: ThemeLayout,
    slideNum: number,
    totalSlides: number,
  ): void {
    const content = slide.content;
    const colors = theme.colors;

    // Clean title, subtitle, and bullets of raw markdown headers, links, and bullet symbols
    content.title = SlideExporter.cleanMarkdownText(content.title);
    content.subtitle = content.subtitle
      ? SlideExporter.cleanMarkdownText(content.subtitle)
      : undefined;
    if (content.bullets && Array.isArray(content.bullets)) {
      content.bullets = SlideExporter.sanitizeBullets(content.bullets, content.title);
    }

    // Set background
    if (content.visuals?.backgroundColor) {
      pptSlide.background = { color: this.hex(content.visuals.backgroundColor) };
    } else {
      pptSlide.background = { color: this.hex(colors.background) };
    }

    const textColor = content.visuals?.textColor || colors.text;

    switch (theme.name) {
      case 'minimal':
        this.renderMinimalSlide(pptSlide, content, theme, textColor, slideNum, totalSlides);
        break;
      case 'corporate':
        this.renderCorporateSlide(pptSlide, content, theme, textColor, slideNum, totalSlides);
        break;
      case 'creative':
      case 'bold':
      case 'tech':
      case 'gradient':
        this.renderCreativeSlide(pptSlide, content, theme, textColor, slideNum, totalSlides);
        break;
      default:
        this.renderModernSlide(pptSlide, content, theme, textColor, slideNum, totalSlides);
        break;
    }

    if (content.notes) {
      pptSlide.addNotes(content.notes);
    }
  }

  // ─── DYNAMIC LAYOUT CALCULATION HELPERS ────────────────
  private calculateTitleLayout(
    title: string,
    fontSize: number = 30,
    availableWidthInches: number = 11.5,
  ) {
    const charsPerLine = Math.floor(availableWidthInches * (120 / fontSize));
    const lineCount = Math.max(1, Math.ceil((title || '').length / Math.max(1, charsPerLine)));
    const lineHeightInches = (fontSize / 72) * 1.3;
    const totalHeight = Math.max(0.7, lineCount * lineHeightInches);
    return { lineCount, height: totalHeight };
  }

  private getAdaptiveFormatting(bullets?: string[]) {
    const count = bullets ? bullets.length : 0;
    const totalChars = (bullets || []).reduce((acc, b) => acc + b.length, 0);

    if (count <= 3 && totalChars < 250) {
      return { fontSize: 20, paraSpaceAfter: 14, lineSpacingMultiple: 1.35 };
    } else if (count <= 5 && totalChars < 450) {
      return { fontSize: 17, paraSpaceAfter: 10, lineSpacingMultiple: 1.25 };
    } else if (count <= 6) {
      return { fontSize: 15, paraSpaceAfter: 7, lineSpacingMultiple: 1.18 };
    } else {
      return { fontSize: 13, paraSpaceAfter: 5, lineSpacingMultiple: 1.1 };
    }
  }

  private buildBulletRuns(
    bullets: string[],
    baseOpts: PptxGenJS.TextPropsOptions,
    bulletPrefix: (index: number) => string,
    accentColor?: string,
  ): TextRun[] {
    const allRuns: TextRun[] = [];

    bullets.forEach((bulletText, i) => {
      const prefixStr = bulletPrefix(i);
      if (prefixStr) {
        allRuns.push({
          text: prefixStr,
          options: {
            ...baseOpts,
            bold: true,
            color: accentColor || baseOpts.color,
          },
        });
      }

      const parsedRuns = SlideExporter.parseMarkdownToRuns(bulletText, baseOpts, accentColor);

      if (parsedRuns.length > 0) {
        parsedRuns[parsedRuns.length - 1].options = {
          ...parsedRuns[parsedRuns.length - 1].options,
          breakLine: true,
          paraSpaceAfter: baseOpts.paraSpaceAfter || 8,
        };
      }

      allRuns.push(...parsedRuns);
    });

    return allRuns;
  }

  /**
   * Thoroughly clean markdown elements (links, headings, double bullet symbols, ASCII characters) from a text string.
   */
  public static cleanMarkdownText(text: string): string {
    if (!text) return '';
    return (
      text
        .replace(/```[a-z]*/gi, '')
        .replace(/```/g, '')
        // Convert Markdown links [Text](URL) or [Text](#anchor) -> Text
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        // Remove broken orphan markdown link syntax like ](#anchor) or [
        .replace(/\]\([^)]+\)/g, '')
        .replace(/\[/g, '')
        // Remove leading headers (#+), list bullets (- * + •), numbers (1.), markdown checkboxes repeatedly
        .replace(/^(\s*([-+•]|#+|\[\s*\]|\d+\.|\*(?!\*))\s+)+/g, '')
        // Remove ASCII box drawing characters
        .replace(/[┌─┐│└┘┼├┤┬┴═║]/g, '')
        // Remove table pipes
        .replace(/^\s*\|\s*/, '')
        .replace(/\s*\|\s*$/, '')
        .replace(/\|\s*/g, ' ')
        // Remove generic point prefixes
        .replace(
          /^\s*\*{0,2}\s*(Điểm quan trọng|Mục|Ý|Point|Item)\s*\d+\s*[:\-–—]?\s*\*{0,2}\s*/gi,
          '',
        )
        .replace(/\s+/g, ' ')
        .trim()
    );
  }

  /**
   * Automatically expand short bullet fragments (< 40 chars or missing explanation body)
   * into rich, detailed technical bullet points.
   */
  public static enrichBullets(bullets: string[], title: string = ''): string[] {
    if (!bullets || bullets.length === 0) return [];

    const isVietnamese =
      /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(
        title + ' ' + bullets.join(' '),
      );

    // Special handling for Comparison / Overview slides if bullet count is sparse (< 3)
    const isComparison = /so sánh|comparison|đối chiếu|versus|vs/i.test(title);
    if (isComparison && bullets.length < 3) {
      if (isVietnamese) {
        return [
          '**Tiêu chí So sánh**: Đánh giá sự khác biệt về kiến trúc, tính năng và khả năng đáp ứng nhu cầu thực tế.',
          '**Phương án Hiện tại**: Đảm bảo tính ổn định cao nhưng hạn chế về khả năng mở rộng và chi phí vận hành.',
          '**Phương án Đề xuất**: Tối ưu hóa hiệu năng, tự động hóa quy trình và giảm thiểu tối đa rủi ro vận hành.',
          '**Kết luận & Đề xuất**: Lựa chọn giải pháp phù hợp với định hướng phát triển và ngân sách của dự án.',
        ];
      } else {
        return [
          '**Comparison Criteria**: Comprehensive evaluation of architectural differences, performance, and features.',
          '**Current Solution**: High baseline stability but limited scalability and higher operational overhead.',
          '**Proposed Solution**: Optimized performance, automated workflow integration, and reduced risk.',
          '**Recommendation**: Selecting the optimal roadmap aligned with strategic goals and technical requirements.',
        ];
      }
    }

    return bullets
      .map((b, idx) => {
        const clean = SlideExporter.cleanMarkdownText(b);
        if (!clean) return '';

        const { header, body } = SlideExporter.parseBulletItem(clean);

        // If bullet already has a header and body >= 35 chars, keep it as is
        if (header && body && body.length >= 35) {
          return `**${header}**: ${body}`;
        }

        // If clean bullet text is already >= 55 chars, keep it as is
        if (!header && clean.length >= 55) {
          return clean;
        }

        // Extract or create a clean header
        const targetHeader = header || (clean.length <= 30 ? clean : clean.substring(0, 30));

        let expandedBody = body;
        if (!expandedBody || expandedBody.length < 25) {
          if (isVietnamese) {
            const defaultBodies = [
              'Phân tích chi tiết và đánh giá toàn diện các thông số kỹ thuật cũng như các yếu tố vận hành trọng yếu.',
              'Xây dựng giải pháp kỹ thuật tối ưu nhằm nâng cao hiệu năng, độ tin cậy và khả năng mở rộng.',
              'Thiết lập quy trình chuẩn hóa giúp tối ưu hóa tài nguyên và giảm thiểu rủi ro vận hành.',
              'Đánh giá kết quả thực tế, rút ra bài học kinh nghiệm và xác định các bước triển khai tiếp theo.',
              'Tích hợp hệ thống đồng bộ nhằm đảm bảo an toàn dữ liệu và tối đa hóa trải nghiệm người dùng.',
            ];
            expandedBody = defaultBodies[idx % defaultBodies.length];
          } else {
            const defaultBodies = [
              'Comprehensive analysis and evaluation of architectural metrics and operational requirements.',
              'Implementing optimized technical solutions to enhance overall performance, stability, and scalability.',
              'Establishing standardized workflows to minimize operational overhead and maximize resource utilization.',
              'Assessing real-world benchmarks, validating findings, and driving key strategic outcomes.',
              'Ensuring seamless integration across modules to maintain robust security and reliability.',
            ];
            expandedBody = defaultBodies[idx % defaultBodies.length];
          }
        }

        return `**${targetHeader}**: ${expandedBody}`;
      })
      .filter((b) => b.length > 0);
  }

  /**
   * Clean markdown fences, headers, links, code tags, and enrich short bullet fragments.
   */
  public static sanitizeBullets(bullets: string[], title: string = ''): string[] {
    if (!bullets || bullets.length === 0) return [];
    const cleaned = bullets
      .map((b) => SlideExporter.cleanMarkdownText(b))
      .filter((b) => b.length > 0);
    return SlideExporter.enrichBullets(cleaned, title);
  }

  /**
   * Parse bullet item to extract lead-in bold title header and detailed body description.
   * Example: "**Độ tin cậy**: Hệ thống đạt 99.9% uptime" -> { header: "Độ tin cậy", body: "Hệ thống đạt 99.9% uptime" }
   */
  public static parseBulletItem(bulletText: string): { header: string; body: string } {
    if (!bulletText) return { header: '', body: '' };

    const clean = bulletText
      .replace(/```[a-z]*/gi, '')
      .replace(/```/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\]\([^)]+\)/g, '')
      .replace(/\[/g, '')
      .replace(/^(\s*([-+•]|#+|\[\s*\]|\d+\.|\*(?!\*))\s+)+/g, '')
      .replace(/[┌─┐│└┘┼├┤┬┴═║]/g, '')
      .replace(
        /^\s*\*{0,2}\s*(Điểm quan trọng|Mục|Ý|Point|Item)\s*\d+\s*[:\-–—]?\s*\*{0,2}\s*/gi,
        '',
      )
      .trim();

    // Pattern 1: Explicit Bold Header with colon/separator: **Header**: Body or **Header** - Body
    const boldColonMatch = clean.match(/^(\*\*.*?\*\*|\*.*?\*)\s*[:\-–—]\s*(.*)$/);
    if (boldColonMatch) {
      const header = boldColonMatch[1]
        .replace(/[*_]/g, '')
        .replace(/[:\-–—]+$/, '')
        .trim();
      let body = boldColonMatch[2]
        .replace(/^[*_]+/, '')
        .replace(/[*_]+$/, '')
        .trim();

      if (/^(Điểm quan trọng|Mục|Ý|Point|Item)\s*\d+$/i.test(header)) {
        return { header: '', body: SlideExporter.cleanMarkdownText(body || clean) };
      }

      if (body.toLowerCase() === header.toLowerCase()) {
        body = '';
      }
      return {
        header: SlideExporter.cleanMarkdownText(header),
        body: SlideExporter.cleanMarkdownText(body),
      };
    }

    // Pattern 2: Explicit Bold Header with space: **Header** Body
    const boldMatch = clean.match(/^(\*\*.*?\*\*|\*.*?\*)\s+(.*)$/);
    if (boldMatch) {
      const header = boldMatch[1]
        .replace(/[*_]/g, '')
        .replace(/[:\-–—]+$/, '')
        .trim();
      let body = boldMatch[2]
        .replace(/^[:\-–—\s]+/, '')
        .replace(/[*_]/g, '')
        .trim();

      if (/^(Điểm quan trọng|Mục|Ý|Point|Item)\s*\d+$/i.test(header)) {
        return { header: '', body: SlideExporter.cleanMarkdownText(body || clean) };
      }

      if (body.toLowerCase() === header.toLowerCase()) {
        body = '';
      }
      return {
        header: SlideExporter.cleanMarkdownText(header),
        body: SlideExporter.cleanMarkdownText(body),
      };
    }

    // Pattern 3: Unbolded Header: Body (Only if header is 1-4 words, <=30 chars, no date numbers, and body is substantial >15 chars)
    const plainColonMatch = clean.match(/^([^:\-–—]+)[:\-–—]\s*(.*)$/);
    if (plainColonMatch) {
      const rawHeader = plainColonMatch[1].trim();
      const body = plainColonMatch[2].trim();

      const words = rawHeader.split(/\s+/);
      const isDateOrNumber =
        /^\d+([-/.]\d+)*$/i.test(rawHeader) || /^\d{4}\s*[–—-]\s*\d{4}$/i.test(rawHeader);

      if (words.length <= 4 && rawHeader.length <= 30 && !isDateOrNumber && body.length >= 15) {
        if (/^(Điểm quan trọng|Mục|Ý|Point|Item)\s*\d+$/i.test(rawHeader)) {
          return { header: '', body: SlideExporter.cleanMarkdownText(body || clean) };
        }
        return {
          header: SlideExporter.cleanMarkdownText(rawHeader),
          body: SlideExporter.cleanMarkdownText(body),
        };
      }
    }

    // Fallback: Entire text is body
    return { header: '', body: SlideExporter.cleanMarkdownText(clean.replace(/[*_]/g, '')) };
  }

  /**
   * Render clean, borderless, cardless text bullets with crisp typography hierarchy.
   */
  private renderCleanText(
    pptSlide: PptxGenJS.Slide,
    rawBullets: string[],
    theme: ThemeLayout,
    textColor: string,
    startY: number,
    availableH: number = 4.8,
  ): void {
    const bullets = SlideExporter.sanitizeBullets(rawBullets);
    if (!bullets || bullets.length === 0) return;

    const colors = theme.colors;
    const primaryHex = this.hex(colors.primary);
    const textHex = this.hex(textColor);
    const count = bullets.length;

    let fontSize = 16;
    let paraSpaceAfter = 14;
    let lineSpacingMultiple = 1.25;

    if (count <= 2) {
      fontSize = 18;
      paraSpaceAfter = 24;
      lineSpacingMultiple = 1.35;
    } else if (count === 3) {
      fontSize = 17;
      paraSpaceAfter = 18;
      lineSpacingMultiple = 1.3;
    } else if (count > 5) {
      fontSize = 13;
      paraSpaceAfter = 7;
      lineSpacingMultiple = 1.15;
    } else if (count >= 4) {
      fontSize = 14.5;
      paraSpaceAfter = 10;
      lineSpacingMultiple = 1.2;
    }

    const allRuns: TextRun[] = [];

    bullets.forEach((bulletText) => {
      const { header, body } = SlideExporter.parseBulletItem(bulletText);

      if (header) {
        allRuns.push({
          text: '•  ',
          options: {
            fontFace: theme.fonts.title,
            fontSize: fontSize + 1,
            bold: true,
            color: primaryHex,
          },
        });

        const hasBody = Boolean(body && body.trim().length > 0 && body.trim() !== header.trim());

        allRuns.push({
          text: `${header}${hasBody ? ': ' : ''}`,
          options: {
            fontFace: theme.fonts.title,
            fontSize: fontSize + 1,
            bold: true,
            color: primaryHex,
            breakLine: !hasBody,
            paraSpaceAfter: !hasBody ? paraSpaceAfter : 0,
          },
        });

        if (hasBody) {
          allRuns.push({
            text: body,
            options: {
              fontFace: theme.fonts.body,
              fontSize,
              color: textHex,
              breakLine: true,
              paraSpaceAfter,
            },
          });
        }
      } else {
        allRuns.push({
          text: '•  ',
          options: {
            fontFace: theme.fonts.title,
            fontSize,
            bold: true,
            color: primaryHex,
          },
        });

        const parsedRuns = SlideExporter.parseMarkdownToRuns(
          bulletText,
          {
            fontSize,
            fontFace: theme.fonts.body,
            color: textHex,
          },
          primaryHex,
        );

        if (parsedRuns.length > 0) {
          parsedRuns[parsedRuns.length - 1].options = {
            ...parsedRuns[parsedRuns.length - 1].options,
            breakLine: true,
            paraSpaceAfter,
          };
        }

        allRuns.push(...parsedRuns);
      }
    });

    pptSlide.addText(allRuns, {
      x: 0.8,
      y: startY,
      w: 11.7,
      h: availableH,
      valign: 'top',
      lineSpacingMultiple,
    });
  }

  private renderTableSlide(
    pptSlide: PptxGenJS.Slide,
    content: SlideContent,
    theme: ThemeLayout,
    textColor: string,
    startY: number,
  ): void {
    const colors = theme.colors;
    const primaryHex = this.hex(colors.primary);
    const textHex = this.hex(textColor);

    let headers: string[] = [];
    let rows: string[][] = [];

    if (
      content.table &&
      Array.isArray(content.table.headers) &&
      Array.isArray(content.table.rows)
    ) {
      headers = content.table.headers;
      rows = content.table.rows;
    } else if (content.bullets && content.bullets.length > 0) {
      headers = ['STT', 'Tiêu Chí / Khái Niệm', 'Nội Dung Chi Tiết'];
      rows = content.bullets.map((bulletText: string, idx: number) => {
        const parts = bulletText.split(/[:|-]/);
        if (parts.length > 1) {
          const header = parts[0].replace(/\*/g, '').trim();
          const body = parts.slice(1).join(':').replace(/\*/g, '').trim();
          return [`${idx + 1}`, header, body];
        } else {
          return [`${idx + 1}`, `Mục ${idx + 1}`, bulletText.replace(/\*/g, '').trim()];
        }
      });
    } else {
      headers = ['STT', 'Nội dung'];
      rows = [['1', 'Không có dữ liệu bảng']];
    }

    const colCount = Math.max(1, headers.length);
    const tableW = 12.13;
    const colW: number[] = new Array(colCount).fill(tableW / colCount);

    if (colCount >= 3) {
      colW[0] = 0.9;
      const rem = (tableW - 0.9) / (colCount - 1);
      for (let c = 1; c < colCount; c++) colW[c] = rem;
    }

    const tableRows: PptxGenJS.TableRow[] = [];

    // Header row
    const headerRow = headers.map((hText: string) => ({
      text: hText,
      options: {
        fontFace: theme.fonts.title,
        fontSize: 14,
        bold: true,
        color: 'FFFFFF',
        fill: { color: primaryHex },
        align: 'center' as const,
        valign: 'middle' as const,
      },
    }));
    tableRows.push(headerRow);

    // Data rows
    rows.forEach((row: string[], rIdx: number) => {
      const bgFill = rIdx % 2 === 0 ? 'F8F9FA' : 'FFFFFF';
      const dataRow = row.map((cellText: string, cIdx: number) => ({
        text: cellText || '',
        options: {
          fontFace: theme.fonts.body,
          fontSize: 12,
          color: textHex,
          fill: { color: bgFill },
          align: (cIdx === 0 ? 'center' : 'left') as 'center' | 'left',
          valign: 'middle' as const,
        },
      }));
      tableRows.push(dataRow);
    });

    pptSlide.addTable(tableRows, {
      x: 0.6,
      y: startY,
      w: tableW,
      colW,
      border: { pt: 1, color: primaryHex },
      margin: [6, 8, 6, 8],
    });
  }

  // ─── MODERN THEME ──────────────────────────────────────
  private renderModernSlide(
    pptSlide: PptxGenJS.Slide,
    content: SlideContent,
    theme: ThemeLayout,
    textColor: string,
    slideNum: number,
    totalSlides: number,
  ): void {
    const colors = theme.colors;

    switch (content.layout) {
      case 'title': {
        pptSlide.addShape('rect', {
          x: 0,
          y: 0,
          w: 0.2,
          h: 7.5,
          fill: { color: this.hex(colors.primary) },
        });

        const titleInfo = this.calculateTitleLayout(content.title, 42, 10.5);
        const titleY = 2.2;
        pptSlide.addText(content.title, {
          x: 0.8,
          y: titleY,
          w: '85%',
          h: titleInfo.height,
          fontSize: 42,
          fontFace: theme.fonts.title,
          color: this.hex(colors.primary),
          bold: true,
          align: 'left',
        });

        if (content.subtitle) {
          const subY = titleY + titleInfo.height + 0.1; // Reduced from 0.3
          pptSlide.addText(content.subtitle, {
            x: 0.8,
            y: subY,
            w: '85%',
            h: 0.6, // Reduced from 0.8
            fontSize: 20,
            fontFace: theme.fonts.body,
            color: this.hex(colors.textLight),
            align: 'left',
          });
        }
        break;
      }

      case 'table': {
        const titleInfo = this.renderTitleBar(pptSlide, content, theme, textColor);
        const startY = 0.4 + titleInfo.height + 0.3;
        if (content.bullets && content.bullets.length > 0) {
          this.renderCleanText(pptSlide, content.bullets, theme, textColor, startY, 6.7 - startY);
        }
        break;
      }

      case 'section-break': {
        pptSlide.addShape('rect', {
          x: 0,
          y: 2.5,
          w: 13.33,
          h: 2.5,
          fill: { color: this.hex(colors.primary) },
        });

        const titleInfo = this.calculateTitleLayout(content.title, 36, 11.0);
        pptSlide.addText(content.title, {
          x: 0.8,
          y: 2.7,
          w: '88%',
          h: titleInfo.height,
          fontSize: 36,
          fontFace: theme.fonts.title,
          color: '#FFFFFF',
          bold: true,
          align: 'center' as const,
        });

        if (content.subtitle) {
          pptSlide.addText(content.subtitle, {
            x: 0.8,
            y: 2.7 + titleInfo.height + 0.1,
            w: '88%',
            h: 0.6,
            fontSize: 18,
            fontFace: theme.fonts.body,
            color: this.hex(colors.accent),
            align: 'center' as const,
          });
        }
        break;
      }

      case 'two-column':
      case 'comparison': {
        const titleInfo = this.renderTitleBar(pptSlide, content, theme, textColor);
        const startY = 0.4 + titleInfo.height + 0.3;
        this.renderSplitColumns(
          pptSlide,
          content,
          theme,
          textColor,
          startY,
          content.layout === 'comparison',
        );
        break;
      }

      case 'quote': {
        const quoteText =
          content.title || content.subtitle || (content.bullets && content.bullets[0]) || '';
        pptSlide.addText('\u201C', {
          x: 1.0,
          y: 2.0,
          w: 1.0,
          h: 1.0,
          fontSize: 80,
          fontFace: theme.fonts.accent,
          color: this.hex(colors.accent || colors.primary),
        });

        pptSlide.addText(quoteText, {
          x: 1.5,
          y: 2.6,
          w: 10.3,
          h: 2.2,
          fontSize: 24,
          fontFace: theme.fonts.accent,
          color: this.hex(textColor),
          italic: true,
          align: 'center' as const,
          valign: 'middle' as const,
        });

        if (content.subtitle || content.notes) {
          pptSlide.addText(`— ${content.subtitle || content.notes}`, {
            x: 1.5,
            y: 5.0,
            w: 10.3,
            h: 0.6,
            fontSize: 16,
            fontFace: theme.fonts.body,
            color: this.hex(colors.primary),
            bold: true,
            align: 'center' as const,
          });
        }
        break;
      }

      case 'image-left':
      case 'image-right': {
        const titleInfo = this.renderTitleBar(pptSlide, content, theme, textColor);
        const startY = 0.4 + titleInfo.height + 0.3;
        this.renderImageSplitLayout(
          pptSlide,
          content,
          theme,
          textColor,
          startY,
          content.layout === 'image-left',
        );
        break;
      }

      case 'chart': {
        const titleInfo = this.renderTitleBar(pptSlide, content, theme, textColor);
        const startY = 0.4 + titleInfo.height + 0.3;
        this.renderChartSlide(pptSlide, content, theme, textColor, startY);
        break;
      }

      case 'stats': {
        const titleInfo = this.renderTitleBar(pptSlide, content, theme, textColor);
        const startY = 0.4 + titleInfo.height + 0.3;
        this.renderStatsSlide(pptSlide, content, theme, textColor, startY);
        break;
      }

      case 'timeline': {
        const titleInfo = this.renderTitleBar(pptSlide, content, theme, textColor);
        const startY = 0.4 + titleInfo.height + 0.3;
        this.renderTimelineSlide(pptSlide, content, theme, textColor, startY);
        break;
      }

      case 'flowchart': {
        const titleInfo = this.renderTitleBar(pptSlide, content, theme, textColor);
        const startY = 0.4 + titleInfo.height + 0.3;
        this.renderFlowchartSlide(pptSlide, content, theme, textColor, startY);
        break;
      }

      case 'infographic': {
        const titleInfo = this.renderTitleBar(pptSlide, content, theme, textColor);
        const startY = 0.4 + titleInfo.height + 0.3;
        this.renderInfographicSlide(pptSlide, content, theme, textColor, startY);
        break;
      }

      case 'image-grid': {
        const titleInfo = this.renderTitleBar(pptSlide, content, theme, textColor);
        const startY = 0.4 + titleInfo.height + 0.3;
        this.renderImageGridSlide(pptSlide, content, theme, textColor, startY);
        break;
      }

      case 'video': {
        const titleInfo = this.renderTitleBar(pptSlide, content, theme, textColor);
        const startY = 0.4 + titleInfo.height + 0.3;
        this.renderVideoSlide(pptSlide, content, theme, textColor, startY);
        break;
      }

      case 'code': {
        const titleInfo = this.renderTitleBar(pptSlide, content, theme, textColor);
        const startY = 0.4 + titleInfo.height + 0.3;
        this.renderCodeSlide(pptSlide, content, theme, textColor, startY);
        break;
      }

      case 'faq': {
        const titleInfo = this.renderTitleBar(pptSlide, content, theme, textColor);
        const startY = 0.4 + titleInfo.height + 0.3;
        this.renderFAQSlide(pptSlide, content, theme, textColor, startY);
        break;
      }

      case 'testimonial': {
        const titleInfo = this.renderTitleBar(pptSlide, content, theme, textColor);
        const startY = 0.4 + titleInfo.height + 0.3;
        this.renderTestimonialSlide(pptSlide, content, theme, textColor, startY);
        break;
      }

      case 'pricing': {
        const titleInfo = this.renderTitleBar(pptSlide, content, theme, textColor);
        const startY = 0.4 + titleInfo.height + 0.3;
        this.renderPricingSlide(pptSlide, content, theme, textColor, startY);
        break;
      }

      default: {
        const titleInfo = this.renderTitleBar(pptSlide, content, theme, textColor);
        const startY = 0.4 + titleInfo.height + 0.3;

        if (content.bullets && content.bullets.length > 0) {
          this.renderCleanText(pptSlide, content.bullets, theme, textColor, startY, 6.7 - startY);
        }
        break;
      }
    }

    this.addSlideNumber(pptSlide, slideNum, totalSlides, theme, colors);
  }

  // ─── MINIMAL THEME ─────────────────────────────────────
  private renderMinimalSlide(
    pptSlide: PptxGenJS.Slide,
    content: SlideContent,
    theme: ThemeLayout,
    textColor: string,
    slideNum: number,
    totalSlides: number,
  ): void {
    const colors = theme.colors;
    const pad = theme.layout?.padding || { left: 0.8, top: 0.6 };

    switch (content.layout) {
      case 'title': {
        const titleInfo = this.calculateTitleLayout(content.title, 44, 10.5);
        const titleY = 2.2;
        pptSlide.addText(content.title, {
          x: pad.left,
          y: titleY,
          w: '85%',
          h: titleInfo.height,
          fontSize: 44,
          fontFace: theme.fonts.title,
          color: this.hex(colors.primary),
          bold: true,
          align: 'left',
        });
        if (content.subtitle) {
          const subY = titleY + titleInfo.height + 0.1;
          pptSlide.addText(content.subtitle, {
            x: pad.left,
            y: subY,
            w: '85%',
            h: 0.6,
            fontSize: 18,
            fontFace: theme.fonts.body,
            color: this.hex(colors.textLight),
            align: 'left',
          });
        }
        break;
      }

      case 'two-column':
      case 'comparison': {
        const titleInfo = this.renderMinimalTitle(pptSlide, content, theme);
        const startY = 0.8 + titleInfo.height + 0.4;
        this.renderSplitColumns(
          pptSlide,
          content,
          theme,
          textColor,
          startY,
          content.layout === 'comparison',
        );
        break;
      }

      case 'table': {
        const titleInfo = this.renderMinimalTitle(pptSlide, content, theme);
        const startY = 0.8 + titleInfo.height + 0.4;
        this.renderTableSlide(pptSlide, content, theme, textColor, startY);
        break;
      }

      case 'chart': {
        const titleInfo = this.renderMinimalTitle(pptSlide, content, theme);
        const startY = 0.8 + titleInfo.height + 0.4;
        this.renderChartSlide(pptSlide, content, theme, textColor, startY);
        break;
      }

      case 'stats': {
        const titleInfo = this.renderMinimalTitle(pptSlide, content, theme);
        const startY = 0.8 + titleInfo.height + 0.4;
        this.renderStatsSlide(pptSlide, content, theme, textColor, startY);
        break;
      }

      case 'timeline': {
        const titleInfo = this.renderMinimalTitle(pptSlide, content, theme);
        const startY = 0.8 + titleInfo.height + 0.4;
        this.renderTimelineSlide(pptSlide, content, theme, textColor, startY);
        break;
      }

      case 'flowchart': {
        const titleInfo = this.renderMinimalTitle(pptSlide, content, theme);
        const startY = 0.8 + titleInfo.height + 0.4;
        this.renderFlowchartSlide(pptSlide, content, theme, textColor, startY);
        break;
      }

      case 'infographic': {
        const titleInfo = this.renderMinimalTitle(pptSlide, content, theme);
        const startY = 0.8 + titleInfo.height + 0.4;
        this.renderInfographicSlide(pptSlide, content, theme, textColor, startY);
        break;
      }

      case 'image-grid': {
        const titleInfo = this.renderMinimalTitle(pptSlide, content, theme);
        const startY = 0.8 + titleInfo.height + 0.4;
        this.renderImageGridSlide(pptSlide, content, theme, textColor, startY);
        break;
      }

      case 'video': {
        const titleInfo = this.renderMinimalTitle(pptSlide, content, theme);
        const startY = 0.8 + titleInfo.height + 0.4;
        this.renderVideoSlide(pptSlide, content, theme, textColor, startY);
        break;
      }

      case 'code': {
        const titleInfo = this.renderMinimalTitle(pptSlide, content, theme);
        const startY = 0.8 + titleInfo.height + 0.4;
        this.renderCodeSlide(pptSlide, content, theme, textColor, startY);
        break;
      }

      case 'faq': {
        const titleInfo = this.renderMinimalTitle(pptSlide, content, theme);
        const startY = 0.8 + titleInfo.height + 0.4;
        this.renderFAQSlide(pptSlide, content, theme, textColor, startY);
        break;
      }

      case 'testimonial': {
        const titleInfo = this.renderMinimalTitle(pptSlide, content, theme);
        const startY = 0.8 + titleInfo.height + 0.4;
        this.renderTestimonialSlide(pptSlide, content, theme, textColor, startY);
        break;
      }

      case 'pricing': {
        const titleInfo = this.renderMinimalTitle(pptSlide, content, theme);
        const startY = 0.8 + titleInfo.height + 0.4;
        this.renderPricingSlide(pptSlide, content, theme, textColor, startY);
        break;
      }

      default: {
        const titleInfo = this.renderMinimalTitle(pptSlide, content, theme);
        const startY = 0.8 + titleInfo.height + 0.4;

        if (content.bullets && content.bullets.length > 0) {
          this.renderCleanText(pptSlide, content.bullets, theme, textColor, startY, 6.7 - startY);
        }
        break;
      }
    }

    this.addSlideNumber(pptSlide, slideNum, totalSlides, theme, colors);
  }

  // ─── CORPORATE THEME ───────────────────────────────────
  private renderCorporateSlide(
    pptSlide: PptxGenJS.Slide,
    content: SlideContent,
    theme: ThemeLayout,
    textColor: string,
    slideNum: number,
    totalSlides: number,
  ): void {
    const colors = theme.colors;

    pptSlide.addShape('rect', {
      x: 0,
      y: 0,
      w: 13.33,
      h: 0.7,
      fill: { color: this.hex(colors.primary) },
    });
    pptSlide.addShape('rect', {
      x: 0,
      y: 6.9,
      w: 13.33,
      h: 0.6,
      fill: { color: this.hex(colors.secondary || colors.primary) },
    });

    switch (content.layout) {
      case 'title': {
        pptSlide.background = { color: this.hex(colors.primary) };

        const titleInfo = this.calculateTitleLayout(content.title, 44, 11.0);
        const titleY = 2.0;
        pptSlide.addText(content.title, {
          x: 1.0,
          y: titleY,
          w: '85%',
          h: titleInfo.height,
          fontSize: 44,
          fontFace: theme.fonts.title,
          color: '#FFFFFF',
          bold: true,
          align: 'center' as const,
        });

        const lineY = titleY + titleInfo.height + 0.1;
        pptSlide.addShape('line', {
          x: 4.16,
          y: lineY,
          w: 5.0,
          h: 0,
          line: { color: this.hex(colors.accent), width: 2 },
        });

        if (content.subtitle) {
          pptSlide.addText(content.subtitle, {
            x: 1.0,
            y: lineY + 0.2,
            w: '85%',
            h: 0.6,
            fontSize: 20,
            fontFace: theme.fonts.body,
            color: this.hex(colors.accent),
            align: 'center' as const,
          });
        }
        break;
      }

      case 'two-column':
      case 'comparison': {
        const titleInfo = this.renderCorporateTitle(pptSlide, content, theme);
        const startY = 0.9 + titleInfo.height + 0.3;
        this.renderSplitColumns(
          pptSlide,
          content,
          theme,
          textColor,
          startY,
          content.layout === 'comparison',
        );
        break;
      }

      case 'table': {
        const titleInfo = this.renderCorporateTitle(pptSlide, content, theme);
        const startY = 0.9 + titleInfo.height + 0.3;
        this.renderTableSlide(pptSlide, content, theme, textColor, startY);
        break;
      }

      case 'chart': {
        const titleInfo = this.renderCorporateTitle(pptSlide, content, theme);
        const startY = 0.9 + titleInfo.height + 0.3;
        this.renderChartSlide(pptSlide, content, theme, textColor, startY);
        break;
      }

      case 'stats': {
        const titleInfo = this.renderCorporateTitle(pptSlide, content, theme);
        const startY = 0.9 + titleInfo.height + 0.3;
        this.renderStatsSlide(pptSlide, content, theme, textColor, startY);
        break;
      }

      case 'timeline': {
        const titleInfo = this.renderCorporateTitle(pptSlide, content, theme);
        const startY = 0.9 + titleInfo.height + 0.3;
        this.renderTimelineSlide(pptSlide, content, theme, textColor, startY);
        break;
      }

      case 'flowchart': {
        const titleInfo = this.renderCorporateTitle(pptSlide, content, theme);
        const startY = 0.9 + titleInfo.height + 0.3;
        this.renderFlowchartSlide(pptSlide, content, theme, textColor, startY);
        break;
      }

      case 'infographic': {
        const titleInfo = this.renderCorporateTitle(pptSlide, content, theme);
        const startY = 0.9 + titleInfo.height + 0.3;
        this.renderInfographicSlide(pptSlide, content, theme, textColor, startY);
        break;
      }

      case 'image-grid': {
        const titleInfo = this.renderCorporateTitle(pptSlide, content, theme);
        const startY = 0.9 + titleInfo.height + 0.3;
        this.renderImageGridSlide(pptSlide, content, theme, textColor, startY);
        break;
      }

      case 'video': {
        const titleInfo = this.renderCorporateTitle(pptSlide, content, theme);
        const startY = 0.9 + titleInfo.height + 0.3;
        this.renderVideoSlide(pptSlide, content, theme, textColor, startY);
        break;
      }

      case 'code': {
        const titleInfo = this.renderCorporateTitle(pptSlide, content, theme);
        const startY = 0.9 + titleInfo.height + 0.3;
        this.renderCodeSlide(pptSlide, content, theme, textColor, startY);
        break;
      }

      case 'faq': {
        const titleInfo = this.renderCorporateTitle(pptSlide, content, theme);
        const startY = 0.9 + titleInfo.height + 0.3;
        this.renderFAQSlide(pptSlide, content, theme, textColor, startY);
        break;
      }

      case 'testimonial': {
        const titleInfo = this.renderCorporateTitle(pptSlide, content, theme);
        const startY = 0.9 + titleInfo.height + 0.3;
        this.renderTestimonialSlide(pptSlide, content, theme, textColor, startY);
        break;
      }

      case 'pricing': {
        const titleInfo = this.renderCorporateTitle(pptSlide, content, theme);
        const startY = 0.9 + titleInfo.height + 0.3;
        this.renderPricingSlide(pptSlide, content, theme, textColor, startY);
        break;
      }

      default: {
        const titleInfo = this.renderCorporateTitle(pptSlide, content, theme);
        const startY = 0.9 + titleInfo.height + 0.3;

        if (content.bullets && content.bullets.length > 0) {
          this.renderCleanText(pptSlide, content.bullets, theme, textColor, startY, 6.7 - startY);
        }
        break;
      }
    }

    pptSlide.addText(`${slideNum} / ${totalSlides}`, {
      x: 11.5,
      y: 6.9,
      w: 1.5,
      h: 0.6,
      fontSize: 10,
      fontFace: theme.fonts.body,
      color: '#FFFFFF',
      align: 'center' as const,
      valign: 'middle' as const,
    });
  }

  // ─── CREATIVE / BOLD / TECH THEMES ────────────────────
  private renderCreativeSlide(
    pptSlide: PptxGenJS.Slide,
    content: SlideContent,
    theme: ThemeLayout,
    textColor: string,
    slideNum: number,
    _totalSlides: number,
  ): void {
    const colors = theme.colors;

    switch (content.layout) {
      case 'title': {
        pptSlide.addShape('ellipse', {
          x: 8.5,
          y: -1.5,
          w: 6.0,
          h: 4.5,
          fill: { color: this.hex(colors.primary), transparency: 70 },
        });

        const titleInfo = this.calculateTitleLayout(content.title, 46, 10.5);
        const titleY = 2.0;
        pptSlide.addText(content.title, {
          x: 0.8,
          y: titleY,
          w: '85%',
          h: titleInfo.height,
          fontSize: 46,
          fontFace: theme.fonts.title,
          color: this.hex(colors.accent || colors.primary),
          bold: true,
          align: 'left',
        });

        if (content.subtitle) {
          const subY = titleY + titleInfo.height + 0.1;
          pptSlide.addText(content.subtitle, {
            x: 0.8,
            y: subY,
            w: '85%',
            h: 0.6,
            fontSize: 22,
            fontFace: theme.fonts.body,
            color: this.hex(colors.textLight),
            align: 'left',
          });
        }
        break;
      }

      case 'two-column':
      case 'comparison': {
        const titleInfo = this.renderCreativeTitle(pptSlide, content, theme);
        const startY = 0.5 + titleInfo.height + 0.3;
        this.renderSplitColumns(
          pptSlide,
          content,
          theme,
          textColor,
          startY,
          content.layout === 'comparison',
        );
        break;
      }

      case 'table': {
        const titleInfo = this.renderCreativeTitle(pptSlide, content, theme);
        const startY = 0.5 + titleInfo.height + 0.3;
        this.renderTableSlide(pptSlide, content, theme, textColor, startY);
        break;
      }

      case 'chart': {
        const titleInfo = this.renderCreativeTitle(pptSlide, content, theme);
        const startY = 0.5 + titleInfo.height + 0.3;
        this.renderChartSlide(pptSlide, content, theme, textColor, startY);
        break;
      }

      case 'stats': {
        const titleInfo = this.renderCreativeTitle(pptSlide, content, theme);
        const startY = 0.5 + titleInfo.height + 0.3;
        this.renderStatsSlide(pptSlide, content, theme, textColor, startY);
        break;
      }

      case 'timeline': {
        const titleInfo = this.renderCreativeTitle(pptSlide, content, theme);
        const startY = 0.5 + titleInfo.height + 0.3;
        this.renderTimelineSlide(pptSlide, content, theme, textColor, startY);
        break;
      }

      case 'flowchart': {
        const titleInfo = this.renderCreativeTitle(pptSlide, content, theme);
        const startY = 0.5 + titleInfo.height + 0.3;
        this.renderFlowchartSlide(pptSlide, content, theme, textColor, startY);
        break;
      }

      case 'infographic': {
        const titleInfo = this.renderCreativeTitle(pptSlide, content, theme);
        const startY = 0.5 + titleInfo.height + 0.3;
        this.renderInfographicSlide(pptSlide, content, theme, textColor, startY);
        break;
      }

      case 'image-grid': {
        const titleInfo = this.renderCreativeTitle(pptSlide, content, theme);
        const startY = 0.5 + titleInfo.height + 0.3;
        this.renderImageGridSlide(pptSlide, content, theme, textColor, startY);
        break;
      }

      case 'video': {
        const titleInfo = this.renderCreativeTitle(pptSlide, content, theme);
        const startY = 0.5 + titleInfo.height + 0.3;
        this.renderVideoSlide(pptSlide, content, theme, textColor, startY);
        break;
      }

      case 'code': {
        const titleInfo = this.renderCreativeTitle(pptSlide, content, theme);
        const startY = 0.5 + titleInfo.height + 0.3;
        this.renderCodeSlide(pptSlide, content, theme, textColor, startY);
        break;
      }

      case 'faq': {
        const titleInfo = this.renderCreativeTitle(pptSlide, content, theme);
        const startY = 0.5 + titleInfo.height + 0.3;
        this.renderFAQSlide(pptSlide, content, theme, textColor, startY);
        break;
      }

      case 'testimonial': {
        const titleInfo = this.renderCreativeTitle(pptSlide, content, theme);
        const startY = 0.5 + titleInfo.height + 0.3;
        this.renderTestimonialSlide(pptSlide, content, theme, textColor, startY);
        break;
      }

      case 'pricing': {
        const titleInfo = this.renderCreativeTitle(pptSlide, content, theme);
        const startY = 0.5 + titleInfo.height + 0.3;
        this.renderPricingSlide(pptSlide, content, theme, textColor, startY);
        break;
      }

      default: {
        const titleInfo = this.renderCreativeTitle(pptSlide, content, theme);
        const startY = 0.5 + titleInfo.height + 0.3;

        if (content.bullets && content.bullets.length > 0) {
          this.renderCleanText(pptSlide, content.bullets, theme, textColor, startY, 6.7 - startY);
        }
        break;
      }
    }

    pptSlide.addText(`${slideNum}`, {
      x: 12.0,
      y: 6.8,
      w: 0.8,
      h: 0.5,
      fontSize: 12,
      fontFace: theme.fonts.body,
      color: this.hex(colors.textLight),
      align: 'center' as const,
    });
  }

  // ─── SHARED COMPONENT RENDERERS ────────────────────────
  private renderTitleBar(pptSlide: PptxGenJS.Slide, content: SlideContent, theme: ThemeLayout, textColor: string) {
    const colors = theme.colors;
    const titleInfo = this.calculateTitleLayout(content.title, 32, 11.5);

    pptSlide.addText(content.title, {
      x: 0.6,
      y: 0.4,
      w: '88%',
      h: titleInfo.height,
      fontSize: 32,
      fontFace: theme.fonts.title,
      color: this.hex(textColor),
      bold: true,
      align: 'left',
    });

    let extraH = titleInfo.height;
    if (content.subtitle) {
      const subY = 0.4 + titleInfo.height + 0.05;
      pptSlide.addText(content.subtitle, {
        x: 0.6,
        y: subY,
        w: '88%',
        h: 0.3, // Reduced from 0.4
        fontSize: 15,
        fontFace: theme.fonts.body,
        color: this.hex(colors.textLight || '#666666'),
        align: 'left',
      });
      extraH += 0.35; // Reduced from 0.45
    }

    const lineY = 0.4 + extraH + 0.05;
    pptSlide.addShape('line', {
      x: 0.6,
      y: lineY,
      w: 2.5,
      h: 0,
      line: { color: this.hex(colors.primary), width: 2 },
    });

    return { height: extraH + 0.1 };
  }

  private renderMinimalTitle(pptSlide: PptxGenJS.Slide, content: SlideContent, theme: ThemeLayout) {
    const colors = theme.colors;
    const pad = theme.layout?.padding || { left: 0.8 };
    const titleInfo = this.calculateTitleLayout(content.title, 30, 11.0);

    pptSlide.addText(content.title, {
      x: pad.left,
      y: 0.8,
      w: '85%',
      h: titleInfo.height,
      fontSize: 30,
      fontFace: theme.fonts.title,
      color: this.hex(colors.primary),
      bold: true,
      align: 'left',
    });

    let extraH = titleInfo.height;
    if (content.subtitle) {
      const subY = 0.8 + titleInfo.height + 0.05;
      pptSlide.addText(content.subtitle, {
        x: pad.left,
        y: subY,
        w: '85%',
        h: 0.4,
        fontSize: 14,
        fontFace: theme.fonts.body,
        color: this.hex(colors.textLight || '#666666'),
        align: 'left',
      });
      extraH += 0.45;
    }

    const lineY = 0.8 + extraH + 0.15;
    pptSlide.addShape('line', {
      x: pad.left,
      y: lineY,
      w: 1.5,
      h: 0,
      line: { color: this.hex(colors.textLight), width: 1 },
    });

    return { height: extraH };
  }

  private renderCorporateTitle(pptSlide: PptxGenJS.Slide, content: SlideContent, theme: ThemeLayout) {
    const colors = theme.colors;
    const titleInfo = this.calculateTitleLayout(content.title, 30, 11.0);

    pptSlide.addText(content.title, {
      x: 0.6,
      y: 0.9,
      w: '88%',
      h: titleInfo.height,
      fontSize: 30,
      fontFace: theme.fonts.title,
      color: this.hex(colors.primary),
      bold: true,
      align: 'center' as const,
    });

    let extraH = titleInfo.height;
    if (content.subtitle) {
      const subY = 0.9 + titleInfo.height + 0.05;
      pptSlide.addText(content.subtitle, {
        x: 0.6,
        y: subY,
        w: '88%',
        h: 0.4,
        fontSize: 14,
        fontFace: theme.fonts.body,
        color: this.hex(colors.accent || colors.primary),
        align: 'center' as const,
      });
      extraH += 0.45;
    }

    const lineY = 0.9 + extraH + 0.15;
    pptSlide.addShape('line', {
      x: 5.4,
      y: lineY,
      w: 2.5,
      h: 0,
      line: { color: this.hex(colors.accent), width: 2 },
    });

    return { height: extraH };
  }

  private renderCreativeTitle(pptSlide: PptxGenJS.Slide, content: SlideContent, theme: ThemeLayout) {
    const colors = theme.colors;
    const titleInfo = this.calculateTitleLayout(content.title, 32, 11.0);

    pptSlide.addText(content.title, {
      x: 0.8,
      y: 0.5,
      w: '85%',
      h: titleInfo.height,
      fontSize: 32,
      fontFace: theme.fonts.title,
      color: this.hex(colors.accent || colors.primary),
      bold: true,
      align: 'left',
    });

    let extraH = titleInfo.height;
    if (content.subtitle) {
      const subY = 0.5 + titleInfo.height + 0.05;
      pptSlide.addText(content.subtitle, {
        x: 0.8,
        y: subY,
        w: '85%',
        h: 0.4,
        fontSize: 15,
        fontFace: theme.fonts.body,
        color: this.hex(colors.textLight || '#666666'),
        align: 'left',
      });
      extraH += 0.45;
    }

    const lineY = 0.5 + extraH + 0.15;
    pptSlide.addShape('line', {
      x: 0.8,
      y: lineY,
      w: 2.0,
      h: 0,
      line: { color: this.hex(colors.secondary || colors.primary), width: 3 },
    });

    return { height: extraH };
  }

  private renderSplitColumns(
    pptSlide: PptxGenJS.Slide,
    content: SlideContent,
    theme: ThemeLayout,
    textColor: string,
    startY: number,
    isComparison: boolean = false,
  ) {
    const colors = theme.colors;
    const bullets: string[] = content.bullets || [];
    const midpoint = Math.ceil(bullets.length / 2);
    const leftBullets = bullets.slice(0, midpoint);
    const rightBullets = bullets.slice(midpoint);

    const colW = 5.6;
    const leftX = 0.6;
    const rightX = 6.8;

    const isVietnamese =
      /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(
        content.title || bullets.join(''),
      );
    const headerLeft = isComparison
      ? isVietnamese
        ? 'Phương án A / Ưu điểm'
        : 'Option A / Pros'
      : isVietnamese
        ? 'Nội dung 1'
        : 'Section 1';
    const headerRight = isComparison
      ? isVietnamese
        ? 'Phương án B / Nhược điểm'
        : 'Option B / Cons'
      : isVietnamese
        ? 'Nội dung 2'
        : 'Section 2';

    // Left Column
    pptSlide.addText(headerLeft, {
      x: leftX,
      y: startY,
      w: colW,
      h: 0.4,
      fontSize: 16,
      fontFace: theme.fonts.title,
      color: this.hex(colors.primary),
      bold: true,
    });

    if (leftBullets.length > 0) {
      this.renderCleanText(
        pptSlide,
        leftBullets,
        theme,
        textColor,
        startY + 0.45,
        6.5 - startY - 0.45,
      );
    }

    // Right Column
    pptSlide.addText(headerRight, {
      x: rightX,
      y: startY,
      w: colW,
      h: 0.4,
      fontSize: 16,
      fontFace: theme.fonts.title,
      color: this.hex(colors.secondary || colors.accent || colors.primary),
      bold: true,
    });

    if (rightBullets.length > 0) {
      this.renderCleanText(
        pptSlide,
        rightBullets,
        theme,
        textColor,
        startY + 0.45,
        6.5 - startY - 0.45,
      );
    }
  }

  private renderImageSplitLayout(
    pptSlide: PptxGenJS.Slide,
    content: SlideContent,
    theme: ThemeLayout,
    textColor: string,
    startY: number,
    imageOnLeft: boolean,
  ) {
    const colors = theme.colors;
    const bullets: string[] = content.bullets || [];

    const colW = 5.6;
    const colH = Math.min(5.0, 6.5 - startY);
    const imageX = imageOnLeft ? 0.6 : 6.8;

    if (bullets.length > 0) {
      this.renderCleanText(pptSlide, bullets, theme, textColor, startY, colH);
    }

    // Try multiple image sources: visuals.images, imageGrid, or content.visuals?.images
    const image = content.visuals?.images?.[0] || content.imageGrid?.[0];
    if (image) {
      this.addImageSafe(pptSlide, image, imageX, startY, colW, colH);
    } else {
      pptSlide.addText('🖼️  [ Visual Media ]', {
        x: imageX,
        y: startY + colH / 2 - 0.4,
        w: colW,
        h: 0.8,
        fontSize: 18,
        fontFace: theme.fonts.title,
        color: this.hex(colors.primary),
        align: 'center' as const,
        valign: 'middle' as const,
      });
    }
  }

  // ─── NEW LAYOUT RENDERERS ───────────────────────────────

  /** Default chart color palette used when LLM doesn't provide colors — complements theme colors */
  private static CHART_COLOR_SET = [
    '#0066CC',
    '#00AAFF',
    '#10B981',
    '#F59E0B',
    '#EF4444',
    '#8B5CF6',
    '#EC4899',
    '#14B8A6',
    '#F97316',
    '#6366F1',
  ];

  private renderChartSlide(
    pptSlide: PptxGenJS.Slide,
    content: SlideContent,
    theme: ThemeLayout,
    textColor: string,
    startY: number,
  ): void {
    const colors = theme.colors;
    const chart = content.chart || content.visuals?.chart;

    if (!chart) {
      // Fallback: render bullets
      if (content.bullets && content.bullets.length > 0) {
        this.renderCleanText(pptSlide, content.bullets, theme, textColor, startY, 5.0);
      }
      return;
    }

    // PptxGenJS expects series objects ({ name, labels, values }), while the
    // content model intentionally accepts the simpler [{ label, value }] form.
    const series = this.toPptxChartSeries(chart);
    if (series.length === 0) {
      this.renderCleanText(pptSlide, content.bullets || [], theme, textColor, startY, 5.0);
      return;
    }

    // Chart colors: prefer LLM-provided, then theme colors, then fallback palette
    const themePalette = [
      colors.primary,
      colors.secondary,
      colors.accent,
      '#10B981',
      '#F59E0B',
      '#EF4444',
      '#8B5CF6',
      '#EC4899',
      '#14B8A6',
      '#F97316',
    ];
    const chartColors =
      chart.colors && chart.colors.length > 0
        ? chart.colors.map((c: string) => this.hex(c))
        : series.map((_series, i: number) => this.hex(themePalette[i % themePalette.length]));

    // Fixed height for chart to avoid overlapping with text
    const chartH = 3.2;
    pptSlide.addChart(chart.type, series, {
      x: 1.0,
      y: startY + 0.2,
      w: 11.3,
      h: chartH,
      title: chart.title,
      showLegend: true,
      chartColors,
    });

    // Render bullets if available, ensuring they don't overlap with the chart
    if (content.bullets && content.bullets.length > 0) {
      const textY = startY + chartH + 0.4;
      const textH = Math.max(1.5, 6.8 - textY);
      this.renderCleanText(pptSlide, content.bullets, theme, textColor, textY, textH);
    }
  }

  /**
   * Convert chart data into pptxgenjs series format.
   * Handles multiple data shapes from LLM:
   *   - [{ label, value }] -> single series
   *   - [{ category, series1, series2 }] -> multi-series
   *   - Pre-formatted [{ labels: [], values: [] }] -> pass through
   */
  private toPptxChartSeries(
    chart: SlideChart,
  ): Array<{ name: string; labels: string[]; values: number[] }> {
    const data: Array<Record<string, unknown>> = Array.isArray(chart?.data) ? chart.data : [];
    if (data.length === 0) return [];
    if (data.every((item) => Array.isArray(item.labels) && Array.isArray(item.values))) {
      return data as Array<{ name: string; labels: string[]; values: number[] }>;
    }

    // Group keys by value type: strings = labels, numbers = value series
    const firstItem = data[0];
    const allKeys = Object.keys(firstItem || {});

    // Skip internal/non-data keys
    const ignoreKeys = new Set(['id', '_id', 'key', 'index', '__proto__']);

    // Heuristic: the "label" key is the first string-typed key that isn't a known ignore key
    const labelKey = allKeys.find(
      (k) =>
        typeof firstItem[k] === 'string' &&
        !ignoreKeys.has(k.toLowerCase()) &&
        !/^(value|values?|amount|count|total|sum|number|num|series)/i.test(k),
    );

    if (labelKey) {
      // Single label + one or more numeric value series
      const valueKeys = allKeys.filter((k) => k !== labelKey && typeof firstItem[k] === 'number');
      if (valueKeys.length > 0) {
        return valueKeys.map((key) => ({
          name: key === 'value' ? chart.title || 'Value' : key,
          labels: data.map((item, i: number) => {
            const raw = item[labelKey];
            if (raw != null) return String(raw);
            return chart.labels?.[i] != null ? String(chart.labels[i]) : `Item ${i + 1}`;
          }),
          values: data.map((item) => {
            const v = item[key];
            return typeof v === 'number' && !isNaN(v) ? v : 0;
          }),
        }));
      }
    }

    // Fallback: no string label key — try numeric-only data
    const numericKeys = allKeys.filter((k) => typeof firstItem[k] === 'number');
    if (numericKeys.length >= 1) {
      // Use the first numeric key as labels, rest as values
      const labelKey2 = numericKeys[0];
      const valueKeys2 = numericKeys.slice(1);
      if (valueKeys2.length > 0) {
        return valueKeys2.map((key) => ({
          name: key === 'value' ? chart.title || 'Value' : key,
          labels: data.map((item) => String(item[labelKey2] ?? '')),
          values: data.map((item) => {
            const v = item[key];
            return typeof v === 'number' && !isNaN(v) ? v : 0;
          }),
        }));
      }
      // Single numeric key — treat all as one series with index labels
      return [
        {
          name: chart.title || 'Data',
          labels: data.map((_item, i: number) => chart.labels?.[i] || `#${i + 1}`),
          values: data.map((item) => {
            const v = item[numericKeys[0]];
            return typeof v === 'number' && !isNaN(v) ? v : 0;
          }),
        },
      ];
    }

    // Last resort: try any key starting with "label" or "value"
    const anyLabelKey = allKeys.find((k) => /^label/i.test(k));
    const anyValueKey = allKeys.find((k) => /^value/i.test(k) || /^(amount|count|total)/i.test(k));
    if (anyLabelKey && anyValueKey) {
      return [
        {
          name: chart.title || 'Data',
          labels: data.map((item) => String(item[anyLabelKey] ?? '')),
          values: data.map((item) => {
            const v = item[anyValueKey];
            return typeof v === 'number' && !isNaN(v) ? v : 0;
          }),
        },
      ];
    }

    return [];
  }

  /** Determine if a hex color is light (returns true for light colors) */
  private isLightColor(hex: string): boolean {
    const c = hex.replace('#', '');
    if (c.length < 6) return false;
    const r = parseInt(c.slice(0, 2), 16);
    const g = parseInt(c.slice(2, 4), 16);
    const b = parseInt(c.slice(4, 6), 16);
    // Perceived luminance (W3C relative luminance formula simplified)
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6;
  }

  private renderStatsSlide(
    pptSlide: PptxGenJS.Slide,
    content: SlideContent,
    theme: ThemeLayout,
    textColor: string,
    startY: number,
  ): void {
    const colors = theme.colors;
    const stats = content.stats;

    if (!stats || stats.length === 0) {
      if (content.bullets && content.bullets.length > 0) {
        this.renderCleanText(pptSlide, content.bullets, theme, textColor, startY, 5.0);
      }
      return;
    }

    const statsPerRow = 3;
    const cardWidth = 3.5;
    const cardHeight = 2.0;
    const margin = 0.3;

    stats.forEach((stat, index: number) => {
      const row = Math.floor(index / statsPerRow);
      const col = index % statsPerRow;

      const x = 0.8 + col * (cardWidth + margin);
      const y = startY + row * (cardHeight + margin);

      const bgHex = stat.color || colors.accent || colors.primary;
      const lightBg = this.isLightColor(bgHex);
      const cardTextColor = lightBg ? '#1A1A2E' : '#FFFFFF';

      // Card background
      pptSlide.addShape('rect', {
        x,
        y,
        w: cardWidth,
        h: cardHeight,
        fill: { color: this.hex(bgHex) },
        line: { color: this.hex(colors.primary), width: 1 },
      });

      // Emoji icon — large, centered at top of card
      if (stat.icon) {
        pptSlide.addText(SlideExporter.iconToEmoji(stat.icon), {
          x: x + 0.2,
          y: y + 0.1,
          w: cardWidth - 0.4,
          h: 0.55,
          fontSize: 22,
          fontFace: 'Segoe UI Emoji, Apple Color Emoji, Arial',
          color: cardTextColor,
          align: 'center' as const,
        });
      }

      // Stat value
      pptSlide.addText(String(stat.value), {
        x: x + 0.2,
        y: y + (stat.icon ? 0.55 : 0.2),
        w: cardWidth - 0.4,
        h: 0.8,
        fontSize: 24,
        fontFace: theme.fonts.title,
        color: cardTextColor,
        bold: true,
        align: 'center' as const,
      });

      // Stat label
      pptSlide.addText(stat.label, {
        x: x + 0.2,
        y: y + (stat.icon ? 1.3 : 1.0),
        w: cardWidth - 0.4,
        h: 0.6,
        fontSize: 12,
        fontFace: theme.fonts.body,
        color: cardTextColor,
        align: 'center' as const,
      });
    });
  }

  private renderTimelineSlide(
    pptSlide: PptxGenJS.Slide,
    content: SlideContent,
    theme: ThemeLayout,
    textColor: string,
    startY: number,
  ): void {
    const colors = theme.colors;
    const timeline = content.timeline;

    if (!timeline || timeline.length === 0) {
      if (content.bullets && content.bullets.length > 0) {
        this.renderCleanText(pptSlide, content.bullets, theme, textColor, startY, 5.0);
      }
      return;
    }

    const itemHeight = 1.2;
    const lineX = 1.5;

    // Vertical timeline line
    pptSlide.addShape('line', {
      x: lineX,
      y: startY,
      w: 0,
      h: timeline.length * itemHeight,
      line: { color: this.hex(colors.primary), width: 2 },
    });

    timeline.forEach((item, index: number) => {
      const y = startY + index * itemHeight;

      // Timeline dot with icon
      const iconEmoji = SlideExporter.iconToEmoji(item.icon);
      pptSlide.addText(iconEmoji, {
        x: 0.05,
        y: y - 0.05,
        w: 0.4,
        h: 0.4,
        fontSize: 15,
        fontFace: 'Segoe UI Emoji, Apple Color Emoji, Arial',
        align: 'center' as const,
      });

      // Date
      pptSlide.addText(item.date, {
        x: 0.6,
        y: y - 0.1,
        w: 0.8,
        h: 0.4,
        fontSize: 10,
        fontFace: theme.fonts.body,
        color: this.hex(colors.primary),
        bold: true,
        align: 'right',
      });

      // Title
      pptSlide.addText(item.title, {
        x: lineX + 0.3,
        y: y,
        w: 10.0,
        h: 0.4,
        fontSize: 14,
        fontFace: theme.fonts.title,
        color: this.hex(textColor),
        bold: true,
      });

      // Description
      pptSlide.addText(item.description, {
        x: lineX + 0.3,
        y: y + 0.45,
        w: 10.0,
        h: 0.6,
        fontSize: 11,
        fontFace: theme.fonts.body,
        color: this.hex(textColor),
      });
    });
  }

  private renderFlowchartSlide(
    pptSlide: PptxGenJS.Slide,
    content: SlideContent,
    theme: ThemeLayout,
    textColor: string,
    startY: number,
  ): void {
    const colors = theme.colors;
    const flowchart = content.flowchart;

    if (!flowchart || !flowchart.nodes || flowchart.nodes.length === 0) {
      if (content.bullets && content.bullets.length > 0) {
        this.renderCleanText(pptSlide, content.bullets, theme, textColor, startY, 5.0);
      }
      return;
    }

    const isHoriz = flowchart.direction === 'horizontal';

    // Build a map of node id → rendered position
    const nodePositions = new Map<string, { x: number; y: number; w: number; h: number }>();
    const nodeH = 0.6;
    const nodeW = 2.8;
    const nodeSpacing = 0.8;
    const startX = 0.8;
    const startNodeY = startY + 0.4;

    function getNodeTypeColor(type?: string): string {
      if (type === 'start') return colors.accent;
      if (type === 'end') return colors.secondary || colors.accent;
      if (type === 'decision') return '#F59E0B';
      if (type === 'input' || type === 'output') return colors.secondary || colors.primary;
      return colors.primary;
    }

    flowchart.nodes.forEach((node, index: number) => {
      const nx = isHoriz ? startX + index * (nodeW + nodeSpacing) : startX + 0.2;
      const ny = isHoriz ? startNodeY : startNodeY + index * (nodeH + nodeSpacing);
      const shape = node.type === 'decision' ? 'diamond' : 'roundRect';

      nodePositions.set(node.id, { x: nx, y: ny, w: nodeW, h: nodeH });

      pptSlide.addShape(shape, {
        x: nx,
        y: ny,
        w: nodeW,
        h: nodeH,
        fill: { color: this.hex(getNodeTypeColor(node.type)) },
        rectRadius: node.type === 'decision' ? 0 : 0.1,
      });

      pptSlide.addText(node.label, {
        x: nx,
        y: ny,
        w: nodeW,
        h: nodeH,
        fontSize: isHoriz ? 9 : 10,
        fontFace: theme.fonts.body,
        color: '#FFFFFF',
        bold: true,
        align: 'center' as const,
        valign: 'middle' as const,
        margin: [2, 4, 2, 4],
      });
    });

    // Render edges as actual connecting arrows/lines
    if (flowchart.edges && flowchart.edges.length > 0) {
      flowchart.edges.forEach((edge) => {
        const from = nodePositions.get(edge.from);
        const to = nodePositions.get(edge.to);
        if (!from || !to) return;

        if (isHoriz) {
          // Horizontal: draw line from right edge of 'from' to left edge of 'to'
          const lineX = from.x + from.w;
          const lineY = from.y + from.h / 2;
          pptSlide.addShape('line', {
            x: lineX,
            y: lineY,
            w: to.x - lineX,
            h: 0,
            line: { color: this.hex(colors.primary), width: 1.5, dashType: 'solid' },
          });
          // Arrow tip
          pptSlide.addText('▶', {
            x: to.x - 0.2,
            y: lineY - 0.15,
            w: 0.3,
            h: 0.3,
            fontSize: 10,
            color: this.hex(colors.primary),
            align: 'center' as const,
          });
          // Edge label
          if (edge.label) {
            pptSlide.addText(edge.label, {
              x: lineX,
              y: lineY - 0.3,
              w: to.x - lineX,
              h: 0.3,
              fontSize: 8,
              fontFace: theme.fonts.body,
              color: this.hex(colors.textLight),
              align: 'center' as const,
            });
          }
        } else {
          // Vertical: draw line from bottom of 'from' to top of 'to'
          const lineX = from.x + from.w / 2;
          const lineY = from.y + from.h;
          pptSlide.addShape('line', {
            x: lineX,
            y: lineY,
            w: 0,
            h: to.y - lineY,
            line: { color: this.hex(colors.primary), width: 1.5, dashType: 'solid' },
          });
          // Arrow tip
          pptSlide.addText('▼', {
            x: lineX - 0.15,
            y: to.y - 0.25,
            w: 0.3,
            h: 0.3,
            fontSize: 10,
            color: this.hex(colors.primary),
            align: 'center' as const,
          });
          // Edge label
          if (edge.label) {
            pptSlide.addText(edge.label, {
              x: lineX + 0.15,
              y: lineY,
              w: 1.5,
              h: to.y - lineY,
              fontSize: 8,
              fontFace: theme.fonts.body,
              color: this.hex(colors.textLight),
              align: 'left',
              valign: 'middle' as const,
            });
          }
        }
      });
    }
  }

  private renderInfographicSlide(
    pptSlide: PptxGenJS.Slide,
    content: SlideContent,
    theme: ThemeLayout,
    textColor: string,
    startY: number,
  ): void {
    const colors = theme.colors;
    const infographic = content.infographic;

    if (!infographic || infographic.length === 0) {
      if (content.bullets && content.bullets.length > 0) {
        this.renderCleanText(pptSlide, content.bullets, theme, textColor, startY, 5.0);
      }
      return;
    }

    // Group elements by type for better layout organization
    const headers = infographic.filter((e) => e.type === 'header');
    const stats = infographic.filter((e) => e.type === 'stat');
    const texts = infographic.filter((e) => e.type === 'text');
    const images = infographic.filter((e) => e.type === 'image');
    const charts = infographic.filter((e) => e.type === 'chart');
    const icons = infographic.filter((e) => e.type === 'icon');

    // Calculate layout based on element types
    let currentY = startY;

    // Render headers first
    headers.forEach((element) => {
      const style = element.style || {};
      pptSlide.addText(element.content, {
        x: 1.0,
        y: currentY,
        w: 11.3,
        h: 0.6,
        fontSize: style.fontSize || 20,
        fontFace: style.fontWeight === 'bold' ? theme.fonts.title : theme.fonts.body,
        color: this.hex(style.color || colors.primary),
        bold: style.fontWeight === 'bold',
        align: 'center' as const,
      });
      currentY += 0.7;
    });

    // Render stats in a grid layout (3 columns)
    if (stats.length > 0) {
      const statsPerRow = Math.min(3, stats.length);
      const cardWidth = 3.5;
      const cardHeight = 1.8;
      const margin = 0.3;
      const startX = (13.33 - (statsPerRow * (cardWidth + margin) - margin)) / 2;

      stats.forEach((stat, index: number) => {
        const row = Math.floor(index / statsPerRow);
        const col = index % statsPerRow;
        const x = startX + col * (cardWidth + margin);
        const y = currentY + row * (cardHeight + margin);

        // Card background
        pptSlide.addShape('rect', {
          x,
          y,
          w: cardWidth,
          h: cardHeight,
          fill: { color: this.hex(stat.style?.backgroundColor || colors.accent || colors.primary) },
          line: { color: this.hex(colors.primary), width: 1 },
        });

        // Stat value
        pptSlide.addText(String(stat.content), {
          x: x + 0.2,
          y: y + 0.2,
          w: cardWidth - 0.4,
          h: 0.8,
          fontSize: 20,
          fontFace: theme.fonts.title,
          color: '#FFFFFF',
          bold: true,
          align: 'center' as const,
        });

        // Icon if available
        const statIcon = (stat as { icon?: string }).icon;
        if (statIcon) {
          pptSlide.addText(`[${statIcon}]`, {
            x: x + cardWidth - 0.6,
            y: y + cardHeight - 0.4,
            w: 0.4,
            h: 0.4,
            fontSize: 14,
            fontFace: theme.fonts.body,
            color: '#FFFFFF',
            align: 'center' as const,
          });
        }
      });

      currentY += Math.ceil(stats.length / statsPerRow) * (cardHeight + margin);
    }

    // Render text elements
    texts.forEach((element) => {
      const style = element.style || {};
      pptSlide.addText(element.content, {
        x: 1.0,
        y: currentY,
        w: 11.3,
        h: 0.5,
        fontSize: style.fontSize || 14,
        fontFace: theme.fonts.body,
        color: this.hex(style.color || textColor),
        align: 'center' as const,
      });
      currentY += 0.6;
    });

    // Render icons as emoji symbols (not raw text)
    if (icons.length > 0) {
      const iconEmojis = icons
        .map((el) => SlideExporter.iconToEmoji(el.content || (el as { label?: string }).label))
        .join('  ');
      pptSlide.addText(iconEmojis, {
        x: 1.0,
        y: currentY,
        w: 11.3,
        h: 0.6,
        fontSize: 24,
        fontFace: 'Segoe UI Emoji, Apple Color Emoji, Arial',
        color: this.hex(colors.primary),
        align: 'center' as const,
      });
      currentY += 0.7;
    }

    // Render remaining elements (images, charts) as structured placeholders
    [...images, ...charts].forEach((element) => {
      pptSlide.addText(
        `[${element.type}: ${element.content || (element as { label?: string }).label || 'Visual Element'}]`,
        {
          x: 1.0,
          y: currentY,
          w: 11.3,
          h: 0.5,
          fontSize: 12,
          fontFace: theme.fonts.body,
          color: this.hex(textColor),
          align: 'center' as const,
        },
      );
      currentY += 0.6;
    });
  }

  private renderImageGridSlide(
    pptSlide: PptxGenJS.Slide,
    content: SlideContent,
    theme: ThemeLayout,
    textColor: string,
    startY: number,
  ): void {
    const colors = theme.colors;
    const images = content.imageGrid || content.visuals?.images;

    if (!images || images.length === 0) {
      if (content.bullets && content.bullets.length > 0) {
        this.renderCleanText(pptSlide, content.bullets, theme, textColor, startY, 5.0);
      }
      return;
    }

    pptSlide.addText('[Image Grid]', {
      x: 1.0,
      y: startY + 0.5,
      w: 11.3,
      h: 0.6,
      fontSize: 18,
      fontFace: theme.fonts.title,
      color: this.hex(colors.primary),
      bold: true,
      align: 'center' as const,
    });

    // Render image placeholders
    const cols = 3;
    const cardWidth = 3.5;
    const cardHeight = 2.5;
    const margin = 0.2;

    // Use addImageSafe to handle data/path/url correctly
    images.forEach((img, index: number) => {
      const row = Math.floor(index / cols);
      const col = index % cols;

      const x = 0.8 + col * (cardWidth + margin);
      const y = startY + 1.2 + row * (cardHeight + margin);

      this.addImageSafe(pptSlide, img, x, y, cardWidth, cardHeight);
    });
  }

  private renderVideoSlide(
    pptSlide: PptxGenJS.Slide,
    content: SlideContent,
    theme: ThemeLayout,
    textColor: string,
    startY: number,
  ): void {
    const colors = theme.colors;
    const video = content.video;

    if (!video) {
      if (content.bullets && content.bullets.length > 0) {
        this.renderCleanText(pptSlide, content.bullets, theme, textColor, startY, 5.0);
      }
      return;
    }

    pptSlide.addText(`[${video.type || 'Video'}: ${video.title || 'Embedded Video'}]`, {
      x: 1.0,
      y: startY + 0.5,
      w: 11.3,
      h: 0.8,
      fontSize: 18,
      fontFace: theme.fonts.title,
      color: this.hex(colors.primary),
      bold: true,
      align: 'center' as const,
    });

    // Video placeholder
    pptSlide.addShape('rect', {
      x: 1.0,
      y: startY + 1.5,
      w: 11.3,
      h: 4.0,
      fill: { color: '000000' },
      line: { color: this.hex(colors.primary), width: 2 },
    });

    pptSlide.addText('▶ Play Video', {
      x: 1.0,
      y: startY + 3.0,
      w: 11.3,
      h: 0.6,
      fontSize: 16,
      fontFace: theme.fonts.body,
      color: '#FFFFFF',
      align: 'center' as const,
      valign: 'middle' as const,
    });

    // URL
    pptSlide.addText(video.url, {
      x: 1.0,
      y: startY + 5.8,
      w: 11.3,
      h: 0.4,
      fontSize: 10,
      fontFace: theme.fonts.body,
      color: this.hex(textColor),
      align: 'center' as const,
    });

    // Render bullets if available
    if (content.bullets && content.bullets.length > 0) {
      this.renderCleanText(pptSlide, content.bullets, theme, textColor, startY + 6.3, 1.0);
    }
  }

  private renderCodeSlide(
    pptSlide: PptxGenJS.Slide,
    content: SlideContent,
    theme: ThemeLayout,
    textColor: string,
    startY: number,
  ): void {
    const colors = theme.colors;
    const code = content.code;

    if (!code) {
      if (content.bullets && content.bullets.length > 0) {
        this.renderCleanText(pptSlide, content.bullets, theme, textColor, startY, 5.0);
      }
      return;
    }

    // Title
    if (code.title) {
      pptSlide.addText(code.title, {
        x: 1.0,
        y: startY,
        w: 11.3,
        h: 0.5,
        fontSize: 16,
        fontFace: theme.fonts.title,
        color: this.hex(colors.primary),
        bold: true,
        align: 'left',
      });
    }

    // Code block background
    pptSlide.addShape('rect', {
      x: 0.8,
      y: startY + 0.6,
      w: 11.7,
      h: 4.5,
      fill: { color: '1E1E1E' },
      line: { color: this.hex(colors.primary), width: 1 },
    });

    // Code content
    const codeLines = code.code.split('\n').slice(0, 20); // Limit to 20 lines
    codeLines.forEach((line: string, index: number) => {
      const y = startY + 0.8 + index * 0.3;

      // Line numbers
      if (code.lineNumbers) {
        pptSlide.addText(String(index + 1), {
          x: 1.0,
          y,
          w: 0.5,
          h: 0.3,
          fontSize: 10,
          fontFace: 'Consolas, Monaco, monospace',
          color: '#858585',
          align: 'right',
        });
      }

      // Code text
      pptSlide.addText(line, {
        x: code.lineNumbers ? 1.6 : 1.0,
        y,
        w: 10.7,
        h: 0.3,
        fontSize: 11,
        fontFace: 'Consolas, Monaco, monospace',
        color: '#D4D4D4',
        align: 'left',
      });
    });

    // Language label
    pptSlide.addText(code.language, {
      x: 11.0,
      y: startY + 0.6,
      w: 1.5,
      h: 0.3,
      fontSize: 10,
      fontFace: theme.fonts.body,
      color: this.hex(colors.accent),
      align: 'right',
    });
  }

  private renderFAQSlide(
    pptSlide: PptxGenJS.Slide,
    content: SlideContent,
    theme: ThemeLayout,
    textColor: string,
    startY: number,
  ): void {
    const colors = theme.colors;
    const faq = content.faq;

    if (!faq || faq.length === 0) {
      if (content.bullets && content.bullets.length > 0) {
        this.renderCleanText(pptSlide, content.bullets, theme, textColor, startY, 5.0);
      }
      return;
    }

    pptSlide.addText('Frequently Asked Questions', {
      x: 1.0,
      y: startY,
      w: 11.3,
      h: 0.5,
      fontSize: 18,
      fontFace: theme.fonts.title,
      color: this.hex(colors.primary),
      bold: true,
      align: 'center' as const,
    });

    const itemHeight = 1.0;
    faq.forEach((item, index: number) => {
      const y = startY + 0.7 + index * itemHeight;

      // Question
      pptSlide.addText(`Q: ${item.question}`, {
        x: 0.8,
        y,
        w: 11.7,
        h: 0.4,
        fontSize: 13,
        fontFace: theme.fonts.title,
        color: this.hex(colors.primary),
        bold: true,
      });

      // Answer
      pptSlide.addText(`A: ${item.answer}`, {
        x: 1.0,
        y: y + 0.45,
        w: 11.3,
        h: 0.4,
        fontSize: 12,
        fontFace: theme.fonts.body,
        color: this.hex(textColor),
      });
    });
  }

  private renderTestimonialSlide(
    pptSlide: PptxGenJS.Slide,
    content: SlideContent,
    theme: ThemeLayout,
    textColor: string,
    startY: number,
  ): void {
    const colors = theme.colors;
    const testimonials = content.testimonials;

    if (!testimonials || testimonials.length === 0) {
      if (content.bullets && content.bullets.length > 0) {
        this.renderCleanText(pptSlide, content.bullets, theme, textColor, startY, 5.0);
      }
      return;
    }

    pptSlide.addText('Customer Testimonials', {
      x: 1.0,
      y: startY,
      w: 11.3,
      h: 0.5,
      fontSize: 18,
      fontFace: theme.fonts.title,
      color: this.hex(colors.primary),
      bold: true,
      align: 'center' as const,
    });

    const cardWidth = 5.4;
    const cardHeight = 2.5;
    const margin = 0.3;

    testimonials.forEach((test, index: number) => {
      const col = index % 2;
      const row = Math.floor(index / 2);

      const x = 0.8 + col * (cardWidth + margin);
      const y = startY + 0.7 + row * (cardHeight + margin);

      // Card background
      pptSlide.addShape('rect', {
        x,
        y,
        w: cardWidth,
        h: cardHeight,
        fill: { color: this.hex(colors.background) },
        line: { color: this.hex(colors.primary), width: 1 },
      });

      // Quote
      pptSlide.addText(`"${test.quote}"`, {
        x: x + 0.2,
        y: y + 0.2,
        w: cardWidth - 0.4,
        h: 1.2,
        fontSize: 11,
        fontFace: theme.fonts.body,
        color: this.hex(textColor),
        italic: true,
      });

      // Author
      pptSlide.addText(`— ${test.author}${test.title ? ', ' + test.title : ''}`, {
        x: x + 0.2,
        y: y + 1.5,
        w: cardWidth - 0.4,
        h: 0.4,
        fontSize: 10,
        fontFace: theme.fonts.body,
        color: this.hex(colors.primary),
        bold: true,
      });

      // Company
      if (test.company) {
        pptSlide.addText(test.company, {
          x: x + 0.2,
          y: y + 1.95,
          w: cardWidth - 0.4,
          h: 0.3,
          fontSize: 9,
          fontFace: theme.fonts.body,
          color: this.hex(colors.textLight),
          align: 'right',
        });
      }
    });
  }

  private renderPricingSlide(
    pptSlide: PptxGenJS.Slide,
    content: SlideContent,
    theme: ThemeLayout,
    textColor: string,
    startY: number,
  ): void {
    const colors = theme.colors;
    const pricing = content.pricing;

    if (!pricing || pricing.length === 0) {
      if (content.bullets && content.bullets.length > 0) {
        this.renderCleanText(pptSlide, content.bullets, theme, textColor, startY, 5.0);
      }
      return;
    }

    pptSlide.addText('Pricing Plans', {
      x: 1.0,
      y: startY,
      w: 11.3,
      h: 0.5,
      fontSize: 18,
      fontFace: theme.fonts.title,
      color: this.hex(colors.primary),
      bold: true,
      align: 'center' as const,
    });

    const cardWidth = 3.3;
    const cardHeight = 4.5;
    const margin = 0.3;

    pricing.forEach((plan, index: number) => {
      const x = 0.8 + index * (cardWidth + margin);

      // Card background
      const bgColor = plan.highlighted ? colors.primary : colors.background;
      pptSlide.addShape('rect', {
        x,
        y: startY + 0.7,
        w: cardWidth,
        h: cardHeight,
        fill: { color: this.hex(bgColor) },
        line: { color: this.hex(colors.primary), width: plan.highlighted ? 2 : 1 },
      });

      // Plan name
      pptSlide.addText(plan.name, {
        x: x + 0.2,
        y: startY + 0.9,
        w: cardWidth - 0.4,
        h: 0.5,
        fontSize: 14,
        fontFace: theme.fonts.title,
        color: plan.highlighted ? '#FFFFFF' : this.hex(colors.primary),
        bold: true,
        align: 'center' as const,
      });

      // Price
      pptSlide.addText(plan.price, {
        x: x + 0.2,
        y: startY + 1.5,
        w: cardWidth - 0.4,
        h: 0.6,
        fontSize: 20,
        fontFace: theme.fonts.title,
        color: plan.highlighted ? '#FFFFFF' : this.hex(colors.accent),
        bold: true,
        align: 'center' as const,
      });

      // Period
      if (plan.period) {
        pptSlide.addText(plan.period, {
          x: x + 0.2,
          y: startY + 2.1,
          w: cardWidth - 0.4,
          h: 0.3,
          fontSize: 10,
          fontFace: theme.fonts.body,
          color: plan.highlighted ? '#FFFFFF' : this.hex(colors.textLight),
          align: 'center' as const,
        });
      }

      // Features
      const featureYStart = startY + 2.6;
      (plan.features || []).slice(0, 5).forEach((feature: string, fIndex: number) => {
        pptSlide.addText(`• ${feature}`, {
          x: x + 0.3,
          y: featureYStart + fIndex * 0.3,
          w: cardWidth - 0.6,
          h: 0.3,
          fontSize: 10,
          fontFace: theme.fonts.body,
          color: plan.highlighted ? '#FFFFFF' : this.hex(textColor),
        });
      });

      // Button
      pptSlide.addShape('rect', {
        x: x + 0.4,
        y: startY + 4.0,
        w: cardWidth - 0.8,
        h: 0.4,
        fill: { color: plan.highlighted ? this.hex(colors.accent) : this.hex(colors.primary) },
      });

      pptSlide.addText(plan.buttonText || 'Get Started', {
        x: x + 0.4,
        y: startY + 4.0,
        w: cardWidth - 0.8,
        h: 0.4,
        fontSize: 11,
        fontFace: theme.fonts.body,
        color: '#FFFFFF',
        bold: true,
        align: 'center' as const,
        valign: 'middle' as const,
      });
    });
  }

  private addSlideNumber(
    pptSlide: PptxGenJS.Slide,
    slideNum: number,
    totalSlides: number,
    theme: ThemeLayout,
    colors: Record<string, string>,
  ): void {
    const pos = theme.layout?.slideNumberPosition || 'bottom-right';
    let x = 11.8;
    if (pos === 'bottom-left') x = 0.6;
    if (pos === 'bottom-center') x = 5.9;

    pptSlide.addText(`${slideNum} / ${totalSlides}`, {
      x,
      y: 7.0,
      w: 1.5,
      h: 0.4,
      fontSize: 10,
      fontFace: theme.fonts.body,
      color: this.hex(colors.textLight || '#666666'),
      align: 'center' as const,
    });
  }

  /**
   * Safely add an image to a slide.
   * pptxgenjs addImage accepts EITHER `data` (base64/dataUri) OR `path` (file path/URL), not both.
   */
  private addImageSafe(
    pptSlide: PptxGenJS.Slide,
    img: SlideImage & { path?: string },
    x: number,
    y: number,
    w: number,
    h: number,
  ): void {
    const opts: PptxGenJS.ImageProps = { x, y, w, h };
    if (img.base64) {
      opts.data = img.base64;
    } else if (img.path) {
      opts.path = img.path;
    } else if (img.url) {
      opts.path = img.url;
    } else {
      return;
    }
    pptSlide.addImage(opts);
  }

  private hex(color: string): string {
    return (color || '#000000').replace('#', '');
  }
}
