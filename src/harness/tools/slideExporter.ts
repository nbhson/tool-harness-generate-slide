import PptxGenJS from 'pptxgenjs';
import { Presentation } from '../../schemas/presentation.schema';
import { Slide } from '../../schemas/slide.schema';
import { logger } from '../../utils/logger';
import { mkdirSync } from 'fs';
import { resolve, dirname } from 'path';

import { WorkerPool } from '../../utils/workerPool';

const log = logger.child('SlideExporter');

interface ThemeLayout {
  name: string;
  description?: string;
  colors: Record<string, string>;
  fonts: Record<string, string>;
  layout: Record<string, any>;
}

export class SlideExporter {
  private workerPool?: WorkerPool;

  constructor(options?: { useWorker?: boolean }) {
    if (options?.useWorker) {
      this.workerPool = new WorkerPool(2);
    }
  }

  /**
   * Helper to parse Markdown bold (**...**) and italic (*...*) strings into PPTX text runs
   */
  public static parseMarkdownToRuns(
    text: string,
    baseOpts: Record<string, any>,
    boldColor?: string
  ): Array<{ text: string; options: Record<string, any> }> {
    if (!text) return [{ text: '', options: baseOpts }];

    // Clean Markdown link syntax, broken orphan link brackets, leading bullets, and raw # headers
    let cleaned = text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\]\([^)]+\)/g, '')
      .replace(/\[/g, '')
      .replace(/^(\s*([-+•]|#+|\[\s*\]|\d+\.|\*(?!\*))\s+)+/g, '')
      .trim();

    if (!cleaned) return [{ text: '', options: baseOpts }];

    const runs: Array<{ text: string; options: Record<string, any> }> = [];
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
    log.info('Exporting presentation to PPTX', { outputPath, slideCount: presentation.slides.length });

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

  private renderSlide(pptSlide: any, slide: Slide, theme: ThemeLayout, slideNum: number, totalSlides: number): void {
    const content = slide.content;
    const colors = theme.colors;

    // Clean title, subtitle, and bullets of raw markdown headers, links, and bullet symbols
    content.title = SlideExporter.cleanMarkdownText(content.title);
    content.subtitle = SlideExporter.cleanMarkdownText(content.subtitle);
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
  private calculateTitleLayout(title: string, fontSize: number = 30, availableWidthInches: number = 11.5) {
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
    baseOpts: Record<string, any>,
    bulletPrefix: (index: number) => string,
    accentColor?: string
  ): Array<{ text: string; options: Record<string, any> }> {
    const allRuns: Array<{ text: string; options: Record<string, any> }> = [];

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
    return text
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
      .replace(/^\s*\*{0,2}\s*(Điểm quan trọng|Mục|Ý|Point|Item)\s*\d+\s*[:\-–—]?\s*\*{0,2}\s*/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Automatically expand short bullet fragments (< 40 chars or missing explanation body)
   * into rich, detailed technical bullet points.
   */
  public static enrichBullets(bullets: string[], title: string = ''): string[] {
    if (!bullets || bullets.length === 0) return [];

    const isVietnamese = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(
      title + ' ' + bullets.join(' ')
    );

    // Special handling for Comparison / Overview slides if bullet count is sparse (< 3)
    const isComparison = /so sánh|comparison|đối chiếu|versus|vs/i.test(title);
    if (isComparison && bullets.length < 3) {
      if (isVietnamese) {
        return [
          '**Tiêu chí So sánh**: Đánh giá sự khác biệt về kiến trúc, tính năng và khả năng đáp ứng nhu cầu thực tế.',
          '**Phương án Hiện tại**: Đảm bảo tính ổn định cao nhưng hạn chế về khả năng mở rộng và chi phí vận hành.',
          '**Phương án Đề xuất**: Tối ưu hóa hiệu năng, tự động hóa quy trình và giảm thiểu tối đa rủi ro vận hành.',
          '**Kết luận & Đề xuất**: Lựa chọn giải pháp phù hợp với định hướng phát triển và ngân sách của dự án.'
        ];
      } else {
        return [
          '**Comparison Criteria**: Comprehensive evaluation of architectural differences, performance, and features.',
          '**Current Solution**: High baseline stability but limited scalability and higher operational overhead.',
          '**Proposed Solution**: Optimized performance, automated workflow integration, and reduced risk.',
          '**Recommendation**: Selecting the optimal roadmap aligned with strategic goals and technical requirements.'
        ];
      }
    }

    return bullets.map((b, idx) => {
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
            'Tích hợp hệ thống đồng bộ nhằm đảm bảo an toàn dữ liệu và tối đa hóa trải nghiệm người dùng.'
          ];
          expandedBody = defaultBodies[idx % defaultBodies.length];
        } else {
          const defaultBodies = [
            'Comprehensive analysis and evaluation of architectural metrics and operational requirements.',
            'Implementing optimized technical solutions to enhance overall performance, stability, and scalability.',
            'Establishing standardized workflows to minimize operational overhead and maximize resource utilization.',
            'Assessing real-world benchmarks, validating findings, and driving key strategic outcomes.',
            'Ensuring seamless integration across modules to maintain robust security and reliability.'
          ];
          expandedBody = defaultBodies[idx % defaultBodies.length];
        }
      }

      return `**${targetHeader}**: ${expandedBody}`;
    }).filter(b => b.length > 0);
  }

  /**
   * Clean markdown fences, headers, links, code tags, and enrich short bullet fragments.
   */
  public static sanitizeBullets(bullets: string[], title: string = ''): string[] {
    if (!bullets || bullets.length === 0) return [];
    const cleaned = bullets
      .map(b => SlideExporter.cleanMarkdownText(b))
      .filter(b => b.length > 0);
    return SlideExporter.enrichBullets(cleaned, title);
  }

  /**
   * Parse bullet item to extract lead-in bold title header and detailed body description.
   * Example: "**Độ tin cậy**: Hệ thống đạt 99.9% uptime" -> { header: "Độ tin cậy", body: "Hệ thống đạt 99.9% uptime" }
   */
  public static parseBulletItem(bulletText: string): { header: string; body: string } {
    if (!bulletText) return { header: '', body: '' };

    let clean = bulletText
      .replace(/```[a-z]*/gi, '')
      .replace(/```/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\]\([^)]+\)/g, '')
      .replace(/\[/g, '')
      .replace(/^(\s*([-+•]|#+|\[\s*\]|\d+\.|\*(?!\*))\s+)+/g, '')
      .replace(/[┌─┐│└┘┼├┤┬┴═║]/g, '')
      .replace(/^\s*\*{0,2}\s*(Điểm quan trọng|Mục|Ý|Point|Item)\s*\d+\s*[:\-–—]?\s*\*{0,2}\s*/gi, '')
      .trim();

    // Pattern 1: Explicit Bold Header with colon/separator: **Header**: Body or **Header** - Body
    const boldColonMatch = clean.match(/^(\*\*.*?\*\*|\*.*?\*)\s*[:\-–—]\s*(.*)$/);
    if (boldColonMatch) {
      const header = boldColonMatch[1].replace(/[\*\_]/g, '').replace(/[:\-–—]+$/, '').trim();
      let body = boldColonMatch[2].replace(/^[\*\_]+/, '').replace(/[\*\_]+$/, '').trim();

      if (/^(Điểm quan trọng|Mục|Ý|Point|Item)\s*\d+$/i.test(header)) {
        return { header: '', body: SlideExporter.cleanMarkdownText(body || clean) };
      }

      if (body.toLowerCase() === header.toLowerCase()) {
        body = '';
      }
      return { header: SlideExporter.cleanMarkdownText(header), body: SlideExporter.cleanMarkdownText(body) };
    }

    // Pattern 2: Explicit Bold Header with space: **Header** Body
    const boldMatch = clean.match(/^(\*\*.*?\*\*|\*.*?\*)\s+(.*)$/);
    if (boldMatch) {
      const header = boldMatch[1].replace(/[\*\_]/g, '').replace(/[:\-–—]+$/, '').trim();
      let body = boldMatch[2].replace(/^[:\-–—\s]+/, '').replace(/[\*\_]/g, '').trim();

      if (/^(Điểm quan trọng|Mục|Ý|Point|Item)\s*\d+$/i.test(header)) {
        return { header: '', body: SlideExporter.cleanMarkdownText(body || clean) };
      }

      if (body.toLowerCase() === header.toLowerCase()) {
        body = '';
      }
      return { header: SlideExporter.cleanMarkdownText(header), body: SlideExporter.cleanMarkdownText(body) };
    }

    // Pattern 3: Unbolded Header: Body (Only if header is 1-4 words, <=30 chars, no date numbers, and body is substantial >15 chars)
    const plainColonMatch = clean.match(/^([^:\-–—]+)[:\-–—]\s*(.*)$/);
    if (plainColonMatch) {
      const rawHeader = plainColonMatch[1].trim();
      const body = plainColonMatch[2].trim();

      const words = rawHeader.split(/\s+/);
      const isDateOrNumber = /^\d+([\-\/\.]\d+)*$/i.test(rawHeader) || /^\d{4}\s*[\-–—]\s*\d{4}$/i.test(rawHeader);

      if (words.length <= 4 && rawHeader.length <= 30 && !isDateOrNumber && body.length >= 15) {
        if (/^(Điểm quan trọng|Mục|Ý|Point|Item)\s*\d+$/i.test(rawHeader)) {
          return { header: '', body: SlideExporter.cleanMarkdownText(body || clean) };
        }
        return { header: SlideExporter.cleanMarkdownText(rawHeader), body: SlideExporter.cleanMarkdownText(body) };
      }
    }

    // Fallback: Entire text is body
    return { header: '', body: SlideExporter.cleanMarkdownText(clean.replace(/[\*\_]/g, '')) };
  }

  /**
   * Render clean, borderless, cardless text bullets with crisp typography hierarchy.
   */
  private renderCleanText(
    pptSlide: any,
    rawBullets: string[],
    theme: ThemeLayout,
    textColor: string,
    startY: number,
    availableH: number = 4.8
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

    const allRuns: Array<{ text: string; options: Record<string, any> }> = [];

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

        const parsedRuns = SlideExporter.parseMarkdownToRuns(bulletText, {
          fontSize,
          fontFace: theme.fonts.body,
          color: textHex,
        }, primaryHex);

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
    pptSlide: any,
    content: any,
    theme: ThemeLayout,
    textColor: string,
    startY: number
  ): void {
    const colors = theme.colors;
    const primaryHex = this.hex(colors.primary);
    const textHex = this.hex(textColor);

    let headers: string[] = [];
    let rows: string[][] = [];

    if (content.table && Array.isArray(content.table.headers) && Array.isArray(content.table.rows)) {
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

    const tableRows: any[][] = [];

    // Header row
    const headerRow = headers.map((hText: string) => ({
      text: hText,
      options: {
        fontFace: theme.fonts.title,
        fontSize: 14,
        bold: true,
        color: 'FFFFFF',
        fill: { color: primaryHex },
        align: 'center',
        valign: 'middle',
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
          align: cIdx === 0 ? 'center' : 'left',
          valign: 'middle',
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
  private renderModernSlide(pptSlide: any, content: any, theme: ThemeLayout, textColor: string, slideNum: number, totalSlides: number): void {
    const colors = theme.colors;

    switch (content.layout) {
      case 'title': {
        pptSlide.addShape('rect', {
          x: 0, y: 0, w: 0.2, h: 7.5,
          fill: { color: this.hex(colors.primary) },
        });

        const titleInfo = this.calculateTitleLayout(content.title, 42, 10.5);
        const titleY = 2.2;
        pptSlide.addText(content.title, {
          x: 0.8, y: titleY, w: '85%', h: titleInfo.height,
          fontSize: 42, fontFace: theme.fonts.title,
          color: this.hex(colors.primary), bold: true, align: 'left',
        });

        if (content.subtitle) {
          const subY = titleY + titleInfo.height + 0.3;
          pptSlide.addText(content.subtitle, {
            x: 0.8, y: subY, w: '85%', h: 0.8,
            fontSize: 20, fontFace: theme.fonts.body,
            color: this.hex(colors.textLight), align: 'left',
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
          x: 0, y: 2.5, w: 13.33, h: 2.5,
          fill: { color: this.hex(colors.primary) },
        });

        const titleInfo = this.calculateTitleLayout(content.title, 36, 11.0);
        pptSlide.addText(content.title, {
          x: 0.8, y: 2.7, w: '88%', h: titleInfo.height,
          fontSize: 36, fontFace: theme.fonts.title,
          color: '#FFFFFF', bold: true, align: 'center',
        });

        if (content.subtitle) {
          pptSlide.addText(content.subtitle, {
            x: 0.8, y: 2.7 + titleInfo.height + 0.1, w: '88%', h: 0.6,
            fontSize: 18, fontFace: theme.fonts.body,
            color: this.hex(colors.accent), align: 'center',
          });
        }
        break;
      }

      case 'two-column':
      case 'comparison': {
        const titleInfo = this.renderTitleBar(pptSlide, content, theme, textColor);
        const startY = 0.4 + titleInfo.height + 0.3;
        this.renderSplitColumns(pptSlide, content, theme, textColor, startY, content.layout === 'comparison');
        break;
      }

      case 'quote': {
        const quoteText = content.title || content.subtitle || (content.bullets && content.bullets[0]) || '';
        pptSlide.addText('\u201C', {
          x: 1.0, y: 2.0, w: 1.0, h: 1.0,
          fontSize: 80, fontFace: theme.fonts.accent,
          color: this.hex(colors.accent || colors.primary),
        });

        pptSlide.addText(quoteText, {
          x: 1.5, y: 2.6, w: 10.3, h: 2.2,
          fontSize: 24, fontFace: theme.fonts.accent,
          color: this.hex(textColor), italic: true, align: 'center', valign: 'middle',
        });

        if (content.subtitle || content.notes) {
          pptSlide.addText(`— ${content.subtitle || content.notes}`, {
            x: 1.5, y: 5.0, w: 10.3, h: 0.6,
            fontSize: 16, fontFace: theme.fonts.body,
            color: this.hex(colors.primary), bold: true, align: 'center',
          });
        }
        break;
      }

      case 'image-left':
      case 'image-right': {
        const titleInfo = this.renderTitleBar(pptSlide, content, theme, textColor);
        const startY = 0.4 + titleInfo.height + 0.3;
        this.renderImageSplitLayout(pptSlide, content, theme, textColor, startY, content.layout === 'image-left');
        break;
      }

      case 'chart':
      case 'stats':
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
  private renderMinimalSlide(pptSlide: any, content: any, theme: ThemeLayout, textColor: string, slideNum: number, totalSlides: number): void {
    const colors = theme.colors;
    const pad = theme.layout?.padding || { left: 0.8, top: 0.6 };

    switch (content.layout) {
      case 'title': {
        const titleInfo = this.calculateTitleLayout(content.title, 44, 10.5);
        pptSlide.addText(content.title, {
          x: pad.left, y: 2.2, w: '85%', h: titleInfo.height,
          fontSize: 44, fontFace: theme.fonts.title,
          color: this.hex(colors.primary), bold: true, align: 'left',
        });
        if (content.subtitle) {
          pptSlide.addText(content.subtitle, {
            x: pad.left, y: 2.2 + titleInfo.height + 0.3, w: '85%', h: 0.8,
            fontSize: 18, fontFace: theme.fonts.body,
            color: this.hex(colors.textLight), align: 'left',
          });
        }
        break;
      }

      case 'two-column':
      case 'comparison': {
        const titleInfo = this.renderMinimalTitle(pptSlide, content, theme);
        const startY = 0.8 + titleInfo.height + 0.4;
        this.renderSplitColumns(pptSlide, content, theme, textColor, startY, content.layout === 'comparison');
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
  private renderCorporateSlide(pptSlide: any, content: any, theme: ThemeLayout, textColor: string, slideNum: number, totalSlides: number): void {
    const colors = theme.colors;

    pptSlide.addShape('rect', {
      x: 0, y: 0, w: 13.33, h: 0.7,
      fill: { color: this.hex(colors.primary) },
    });
    pptSlide.addShape('rect', {
      x: 0, y: 6.9, w: 13.33, h: 0.6,
      fill: { color: this.hex(colors.secondary || colors.primary) },
    });

    switch (content.layout) {
      case 'title': {
        pptSlide.background = { color: this.hex(colors.primary) };

        const titleInfo = this.calculateTitleLayout(content.title, 44, 11.0);
        const titleY = 2.0;
        pptSlide.addText(content.title, {
          x: 1.0, y: titleY, w: '85%', h: titleInfo.height,
          fontSize: 44, fontFace: theme.fonts.title,
          color: '#FFFFFF', bold: true, align: 'center',
        });

        const lineY = titleY + titleInfo.height + 0.3;
        pptSlide.addShape('line', {
          x: 4.16, y: lineY, w: 5.0, h: 0,
          line: { color: this.hex(colors.accent), width: 2 },
        });

        if (content.subtitle) {
          pptSlide.addText(content.subtitle, {
            x: 1.0, y: lineY + 0.3, w: '85%', h: 0.8,
            fontSize: 20, fontFace: theme.fonts.body,
            color: this.hex(colors.accent), align: 'center',
          });
        }
        break;
      }

      case 'two-column':
      case 'comparison': {
        const titleInfo = this.renderCorporateTitle(pptSlide, content, theme);
        const startY = 0.9 + titleInfo.height + 0.3;
        this.renderSplitColumns(pptSlide, content, theme, textColor, startY, content.layout === 'comparison');
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
      x: 11.5, y: 6.9, w: 1.5, h: 0.6,
      fontSize: 10, fontFace: theme.fonts.body,
      color: '#FFFFFF', align: 'center', valign: 'middle',
    });
  }

  // ─── CREATIVE / BOLD / TECH THEMES ────────────────────
  private renderCreativeSlide(pptSlide: any, content: any, theme: ThemeLayout, textColor: string, slideNum: number, totalSlides: number): void {
    const colors = theme.colors;

    switch (content.layout) {
      case 'title': {
        pptSlide.addShape('ellipse', {
          x: 8.5, y: -1.5, w: 6.0, h: 4.5,
          fill: { color: this.hex(colors.primary), transparency: 70 },
        });

        const titleInfo = this.calculateTitleLayout(content.title, 46, 10.5);
        pptSlide.addText(content.title, {
          x: 0.8, y: 2.0, w: '85%', h: titleInfo.height,
          fontSize: 46, fontFace: theme.fonts.title,
          color: this.hex(colors.accent || colors.primary), bold: true, align: 'left',
        });

        if (content.subtitle) {
          pptSlide.addText(content.subtitle, {
            x: 0.8, y: 2.0 + titleInfo.height + 0.3, w: '85%', h: 0.8,
            fontSize: 22, fontFace: theme.fonts.body,
            color: this.hex(colors.textLight), align: 'left',
          });
        }
        break;
      }

      case 'two-column':
      case 'comparison': {
        const titleInfo = this.renderCreativeTitle(pptSlide, content, theme);
        const startY = 0.5 + titleInfo.height + 0.3;
        this.renderSplitColumns(pptSlide, content, theme, textColor, startY, content.layout === 'comparison');
        break;
      }

      case 'chart':
      case 'stats':
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
      x: 12.0, y: 6.8, w: 0.8, h: 0.5,
      fontSize: 12, fontFace: theme.fonts.body,
      color: this.hex(colors.textLight), align: 'center',
    });
  }

  // ─── SHARED COMPONENT RENDERERS ────────────────────────
  private renderTitleBar(pptSlide: any, content: any, theme: ThemeLayout, textColor: string) {
    const colors = theme.colors;
    const titleInfo = this.calculateTitleLayout(content.title, 32, 11.5);

    pptSlide.addText(content.title, {
      x: 0.6, y: 0.4, w: '88%', h: titleInfo.height,
      fontSize: 32, fontFace: theme.fonts.title,
      color: this.hex(textColor), bold: true, align: 'left',
    });

    let extraH = titleInfo.height;
    if (content.subtitle) {
      const subY = 0.4 + titleInfo.height + 0.05;
      pptSlide.addText(content.subtitle, {
        x: 0.6, y: subY, w: '88%', h: 0.4,
        fontSize: 15, fontFace: theme.fonts.body,
        color: this.hex(colors.textLight || '#666666'), align: 'left',
      });
      extraH += 0.45;
    }

    const lineY = 0.4 + extraH + 0.05;
    pptSlide.addShape('line', {
      x: 0.6, y: lineY, w: 2.5, h: 0,
      line: { color: this.hex(colors.primary), width: 2 },
    });

    return { height: extraH + 0.1 };
  }

  private renderMinimalTitle(pptSlide: any, content: any, theme: ThemeLayout) {
    const colors = theme.colors;
    const pad = theme.layout?.padding || { left: 0.8 };
    const titleInfo = this.calculateTitleLayout(content.title, 30, 11.0);

    pptSlide.addText(content.title, {
      x: pad.left, y: 0.8, w: '85%', h: titleInfo.height,
      fontSize: 30, fontFace: theme.fonts.title,
      color: this.hex(colors.primary), bold: true, align: 'left',
    });

    let extraH = titleInfo.height;
    if (content.subtitle) {
      const subY = 0.8 + titleInfo.height + 0.05;
      pptSlide.addText(content.subtitle, {
        x: pad.left, y: subY, w: '85%', h: 0.4,
        fontSize: 14, fontFace: theme.fonts.body,
        color: this.hex(colors.textLight || '#666666'), align: 'left',
      });
      extraH += 0.45;
    }

    const lineY = 0.8 + extraH + 0.15;
    pptSlide.addShape('line', {
      x: pad.left, y: lineY, w: 1.5, h: 0,
      line: { color: this.hex(colors.textLight), width: 1 },
    });

    return { height: extraH };
  }

  private renderCorporateTitle(pptSlide: any, content: any, theme: ThemeLayout) {
    const colors = theme.colors;
    const titleInfo = this.calculateTitleLayout(content.title, 30, 11.0);

    pptSlide.addText(content.title, {
      x: 0.6, y: 0.9, w: '88%', h: titleInfo.height,
      fontSize: 30, fontFace: theme.fonts.title,
      color: this.hex(colors.primary), bold: true, align: 'center',
    });

    let extraH = titleInfo.height;
    if (content.subtitle) {
      const subY = 0.9 + titleInfo.height + 0.05;
      pptSlide.addText(content.subtitle, {
        x: 0.6, y: subY, w: '88%', h: 0.4,
        fontSize: 14, fontFace: theme.fonts.body,
        color: this.hex(colors.accent || colors.primary), align: 'center',
      });
      extraH += 0.45;
    }

    const lineY = 0.9 + extraH + 0.15;
    pptSlide.addShape('line', {
      x: 5.4, y: lineY, w: 2.5, h: 0,
      line: { color: this.hex(colors.accent), width: 2 },
    });

    return { height: extraH };
  }

  private renderCreativeTitle(pptSlide: any, content: any, theme: ThemeLayout) {
    const colors = theme.colors;
    const titleInfo = this.calculateTitleLayout(content.title, 32, 11.0);

    pptSlide.addText(content.title, {
      x: 0.8, y: 0.5, w: '85%', h: titleInfo.height,
      fontSize: 32, fontFace: theme.fonts.title,
      color: this.hex(colors.accent || colors.primary), bold: true, align: 'left',
    });

    let extraH = titleInfo.height;
    if (content.subtitle) {
      const subY = 0.5 + titleInfo.height + 0.05;
      pptSlide.addText(content.subtitle, {
        x: 0.8, y: subY, w: '85%', h: 0.4,
        fontSize: 15, fontFace: theme.fonts.body,
        color: this.hex(colors.textLight || '#666666'), align: 'left',
      });
      extraH += 0.45;
    }

    const lineY = 0.5 + extraH + 0.15;
    pptSlide.addShape('line', {
      x: 0.8, y: lineY, w: 2.0, h: 0,
      line: { color: this.hex(colors.secondary || colors.primary), width: 3 },
    });

    return { height: extraH };
  }

  private renderSplitColumns(
    pptSlide: any,
    content: any,
    theme: ThemeLayout,
    textColor: string,
    startY: number,
    isComparison: boolean = false
  ) {
    const colors = theme.colors;
    const bullets: string[] = content.bullets || [];
    const midpoint = Math.ceil(bullets.length / 2);
    const leftBullets = bullets.slice(0, midpoint);
    const rightBullets = bullets.slice(midpoint);

    const colW = 5.6;
    const leftX = 0.6;
    const rightX = 6.8;

    const isVietnamese = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(content.title || bullets.join(''));
    const headerLeft = isComparison
      ? (isVietnamese ? 'Phương án A / Ưu điểm' : 'Option A / Pros')
      : (isVietnamese ? 'Nội dung 1' : 'Section 1');
    const headerRight = isComparison
      ? (isVietnamese ? 'Phương án B / Nhược điểm' : 'Option B / Cons')
      : (isVietnamese ? 'Nội dung 2' : 'Section 2');

    // Left Column
    pptSlide.addText(headerLeft, {
      x: leftX, y: startY, w: colW, h: 0.4,
      fontSize: 16, fontFace: theme.fonts.title,
      color: this.hex(colors.primary), bold: true,
    });

    if (leftBullets.length > 0) {
      this.renderCleanText(pptSlide, leftBullets, theme, textColor, startY + 0.45, 6.5 - startY - 0.45);
    }

    // Right Column
    pptSlide.addText(headerRight, {
      x: rightX, y: startY, w: colW, h: 0.4,
      fontSize: 16, fontFace: theme.fonts.title,
      color: this.hex(colors.secondary || colors.accent || colors.primary), bold: true,
    });

    if (rightBullets.length > 0) {
      this.renderCleanText(pptSlide, rightBullets, theme, textColor, startY + 0.45, 6.5 - startY - 0.45);
    }
  }

  private renderImageSplitLayout(
    pptSlide: any,
    content: any,
    theme: ThemeLayout,
    textColor: string,
    startY: number,
    imageOnLeft: boolean
  ) {
    const colors = theme.colors;
    const bullets: string[] = content.bullets || [];

    const colW = 5.6;
    const colH = Math.min(5.0, 6.5 - startY);
    const textX = imageOnLeft ? 6.8 : 0.6;
    const imageX = imageOnLeft ? 0.6 : 6.8;

    if (bullets.length > 0) {
      this.renderCleanText(pptSlide, bullets, theme, textColor, startY, colH);
    }

    pptSlide.addText('🖼️  [ Visual Media ]', {
      x: imageX, y: startY + colH / 2 - 0.4, w: colW, h: 0.8,
      fontSize: 18, fontFace: theme.fonts.title,
      color: this.hex(colors.primary), align: 'center', valign: 'middle',
    });
  }

  private addSlideNumber(pptSlide: any, slideNum: number, totalSlides: number, theme: ThemeLayout, colors: Record<string, string>): void {
    const pos = theme.layout?.slideNumberPosition || 'bottom-right';
    let x = 11.8;
    if (pos === 'bottom-left') x = 0.6;
    if (pos === 'bottom-center') x = 5.9;

    pptSlide.addText(`${slideNum} / ${totalSlides}`, {
      x, y: 7.0, w: 1.5, h: 0.4,
      fontSize: 10, fontFace: theme.fonts.body,
      color: this.hex(colors.textLight || '#666666'), align: 'center',
    });
  }

  private hex(color: string): string {
    return (color || '#000000').replace('#', '');
  }
}