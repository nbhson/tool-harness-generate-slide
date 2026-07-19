import PptxGenJS from 'pptxgenjs';
import { Presentation } from '../../schemas/presentation.schema';
import { Slide, SlideTheme } from '../../schemas/slide.schema';
import { logger } from '../../utils/logger';
import { mkdirSync } from 'fs';
import { resolve, dirname } from 'path';

const log = logger.child('SlideExporter');

interface ThemeLayout {
  name: string;
  description: string;
  colors: Record<string, string>;
  fonts: Record<string, string>;
  layout: Record<string, any>;
}

export class SlideExporter {
  async exportPPTX(presentation: Presentation, outputPath: string): Promise<string> {
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
    
    // Ensure output directory exists
    const dir = dirname(absolutePath);
    mkdirSync(dir, { recursive: true });
    
    await pptx.writeFile({ fileName: absolutePath });

    log.info('PPTX exported successfully', { path: absolutePath });
    return absolutePath;
  }

  private renderSlide(pptSlide: any, slide: Slide, theme: ThemeLayout, slideNum: number, totalSlides: number): void {
    const content = slide.content;
    const layout = theme.layout;
    const colors = theme.colors;

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

  // ─── MODERN THEME ──────────────────────────────────────
  // Clean, blue gradient accents, left-aligned title, numbered bullets
  private renderModernSlide(pptSlide: any, content: any, theme: ThemeLayout, textColor: string, slideNum: number, totalSlides: number): void {
    const colors = theme.colors;

    switch (content.layout) {
      case 'title':
        // Blue gradient accent bar on left
        pptSlide.addShape('rect', {
          x: 0, y: 0, w: 0.15, h: 7.5,
          fill: { color: this.hex(colors.primary) },
        });

        pptSlide.addText(content.title, {
          x: 0.8, y: 2.2, w: '85%', h: 1.5,
          fontSize: 42, fontFace: theme.fonts.title,
          color: this.hex(colors.primary), bold: true, align: 'left',
        });

        if (content.subtitle) {
          pptSlide.addText(content.subtitle, {
            x: 0.8, y: 3.8, w: '85%', h: 0.8,
            fontSize: 20, fontFace: theme.fonts.body,
            color: this.hex(colors.textLight), align: 'left',
          });
        }
        break;

      case 'section-break':
        pptSlide.addShape('rect', {
          x: 0, y: 2.8, w: 13.33, h: 2.0,
          fill: { color: this.hex(colors.primary) },
        });
        pptSlide.addText(content.title, {
          x: 0.8, y: 3.0, w: '85%', h: 1.5,
          fontSize: 36, fontFace: theme.fonts.title,
          color: '#FFFFFF', bold: true, align: 'center',
        });
        break;

      case 'two-column':
        this.renderTitleBar(pptSlide, content, theme, textColor);
        this.renderColumnBullets(pptSlide, content, theme, textColor, true);
        break;

      case 'quote':
        pptSlide.addText('\u201C', {
          x: 0.8, y: 1.2, w: 1.5, h: 1.5,
          fontSize: 80, fontFace: theme.fonts.accent,
          color: this.hex(colors.accent),
        });
        pptSlide.addText(content.title || content.subtitle || '', {
          x: 1.5, y: 2.5, w: '75%', h: 2.5,
          fontSize: 28, fontFace: theme.fonts.accent,
          color: this.hex(textColor), italic: true, align: 'center',
        });
        break;

      default:
        this.renderTitleBar(pptSlide, content, theme, textColor);

        if (content.bullets && content.bullets.length > 0) {
          const bulletText = content.bullets.map((b: string, i: number) => ({
            text: `${i + 1}.  ${b}`,
            options: {
              fontSize: 18, fontFace: theme.fonts.body,
              color: this.hex(textColor), paraSpaceAfter: 10,
            },
          }));
          pptSlide.addText(bulletText, {
            x: 0.6, y: 1.8, w: '88%', h: 5.0, valign: 'top',
            lineSpacingMultiple: 1.3,
          });
        }
        break;
    }

    this.addSlideNumber(pptSlide, slideNum, totalSlides, theme, colors);
  }

  // ─── MINIMAL THEME ─────────────────────────────────────
  // Extra whitespace, no bullet markers, monochrome, clean
  private renderMinimalSlide(pptSlide: any, content: any, theme: ThemeLayout, textColor: string, slideNum: number, totalSlides: number): void {
    const colors = theme.colors;
    const pad = theme.layout.padding;

    switch (content.layout) {
      case 'title':
        pptSlide.addText(content.title, {
          x: pad.left, y: 2.5, w: '85%', h: 1.5,
          fontSize: 44, fontFace: theme.fonts.title,
          color: this.hex(colors.primary), bold: true, align: 'left',
        });
        if (content.subtitle) {
          pptSlide.addText(content.subtitle, {
            x: pad.left, y: 4.0, w: '85%', h: 0.8,
            fontSize: 18, fontFace: theme.fonts.body,
            color: this.hex(colors.textLight), align: 'left',
          });
        }
        break;

      case 'section-break':
        pptSlide.addText(content.title, {
          x: pad.left, y: 3.0, w: '85%', h: 1.5,
          fontSize: 36, fontFace: theme.fonts.title,
          color: this.hex(colors.text), bold: true, align: 'left',
        });
        break;

      case 'two-column':
        this.renderTitleBar(pptSlide, content, theme, textColor);
        this.renderColumnBullets(pptSlide, content, theme, textColor, false);
        break;

      case 'quote':
        pptSlide.addText('\u201C', {
          x: pad.left + 0.5, y: 1.5, w: 1.0, h: 1.0,
          fontSize: 60, fontFace: theme.fonts.accent,
          color: this.hex(colors.accent),
        });
        pptSlide.addText(content.title || content.subtitle || '', {
          x: pad.left + 1.0, y: 2.8, w: '75%', h: 2.5,
          fontSize: 26, fontFace: theme.fonts.accent,
          color: this.hex(textColor), italic: true, align: 'left',
        });
        break;

      default:
        // Minimal: title only, no accent line
        pptSlide.addText(content.title, {
          x: pad.left, y: 0.8, w: '85%', h: 1.0,
          fontSize: 30, fontFace: theme.fonts.title,
          color: this.hex(colors.primary), bold: true, align: 'left',
        });

        // Thin separator line
        pptSlide.addShape('line', {
          x: pad.left, y: 1.8, w: 1.5, h: 0,
          line: { color: this.hex(colors.textLight), width: 1 },
        });

        // Bullets without markers (just text, left-aligned with generous spacing)
        if (content.bullets && content.bullets.length > 0) {
          const bulletText = content.bullets.map((b: string) => ({
            text: b,
            options: {
              fontSize: 18, fontFace: theme.fonts.body,
              color: this.hex(textColor), paraSpaceAfter: 14,
            },
          }));
          pptSlide.addText(bulletText, {
            x: pad.left, y: 2.2, w: '85%', h: 4.5,
            valign: 'top', lineSpacingMultiple: 1.5,
          });
        }
        break;
    }

    this.addSlideNumber(pptSlide, slideNum, totalSlides, theme, colors);
  }

  // ─── CORPORATE THEME ───────────────────────────────────
  // Navy header/footer bars, gold accent, Times New Roman, formal
  private renderCorporateSlide(pptSlide: any, content: any, theme: ThemeLayout, textColor: string, slideNum: number, totalSlides: number): void {
    const colors = theme.colors;

    // Header bar
    if (theme.layout.headerBar) {
      pptSlide.addShape('rect', {
        x: 0, y: 0, w: 13.33, h: 0.8,
        fill: { color: this.hex(colors.primary) },
      });
    }

    // Footer bar
    if (theme.layout.footerBar) {
      pptSlide.addShape('rect', {
        x: 0, y: 6.9, w: 13.33, h: 0.6,
        fill: { color: this.hex(colors.secondary) },
      });
    }

    switch (content.layout) {
      case 'title':
        // Full-width navy background for title slides
        pptSlide.background = { color: this.hex(colors.primary) };

        pptSlide.addText(content.title, {
          x: 1.0, y: 2.0, w: '80%', h: 1.8,
          fontSize: 44, fontFace: theme.fonts.title,
          color: '#FFFFFF', bold: true, align: 'center',
        });

        if (content.subtitle) {
          pptSlide.addText(content.subtitle, {
            x: 1.0, y: 4.0, w: '80%', h: 0.8,
            fontSize: 20, fontFace: theme.fonts.body,
            color: this.hex(colors.accent), align: 'center',
          });
        }

        // Gold divider line
        pptSlide.addShape('line', {
          x: 4.0, y: 3.8, w: 5.0, h: 0,
          line: { color: this.hex(colors.accent), width: 2 },
        });
        break;

      case 'section-break':
        pptSlide.background = { color: this.hex(colors.primary) };
        pptSlide.addText(content.title, {
          x: 1.0, y: 2.8, w: '80%', h: 1.5,
          fontSize: 36, fontFace: theme.fonts.title,
          color: this.hex(colors.accent), bold: true, align: 'center',
        });
        break;

      case 'two-column':
        pptSlide.addText(content.title, {
          x: 0.6, y: 1.1, w: '88%', h: 1.0,
          fontSize: 30, fontFace: theme.fonts.title,
          color: this.hex(colors.primary), bold: true, align: 'center',
        });
        // Gold divider under title
        pptSlide.addShape('line', {
          x: 5.5, y: 2.0, w: 2.3, h: 0,
          line: { color: this.hex(colors.accent), width: 2 },
        });
        this.renderColumnBullets(pptSlide, content, theme, textColor, false, 2.3);
        break;

      case 'quote':
        pptSlide.addText('\u201C', {
          x: 1.0, y: 1.5, w: 1.5, h: 1.5,
          fontSize: 80, fontFace: theme.fonts.accent,
          color: this.hex(colors.accent),
        });
        pptSlide.addText(content.title || content.subtitle || '', {
          x: 1.5, y: 2.8, w: '75%', h: 2.5,
          fontSize: 28, fontFace: theme.fonts.accent,
          color: this.hex(textColor), italic: true, align: 'center',
        });
        break;

      default:
        pptSlide.addText(content.title, {
          x: 0.6, y: 1.1, w: '88%', h: 1.0,
          fontSize: 30, fontFace: theme.fonts.title,
          color: this.hex(colors.primary), bold: true, align: 'center',
        });

        // Gold underline
        pptSlide.addShape('line', {
          x: 5.5, y: 2.0, w: 2.3, h: 0,
          line: { color: this.hex(colors.accent), width: 2 },
        });

        if (content.bullets && content.bullets.length > 0) {
          const bulletText = content.bullets.map((b: string) => ({
            text: b,
            options: {
              fontSize: 18, fontFace: theme.fonts.body,
              color: this.hex(textColor),
              bullet: { code: '2022', style: 'numbered' },
              paraSpaceAfter: 8,
            },
          }));
          pptSlide.addText(bulletText, {
            x: 0.8, y: 2.4, w: '85%', h: 4.2, valign: 'top',
            lineSpacingMultiple: 1.3,
          });
        }
        break;
    }

    // Slide number in footer
    if (theme.layout.footerBar) {
      pptSlide.addText(`${slideNum} / ${totalSlides}`, {
        x: 11.5, y: 6.9, w: 1.5, h: 0.6,
        fontSize: 10, fontFace: theme.fonts.body,
        color: '#FFFFFF', align: 'center', valign: 'middle',
      });
    }
  }

  // ─── CREATIVE THEME ────────────────────────────────────
  // Dark background, gradient shapes, emoji bullets, card style
  private renderCreativeSlide(pptSlide: any, content: any, theme: ThemeLayout, textColor: string, slideNum: number, totalSlides: number): void {
    const colors = theme.colors;
    const radius = theme.layout.cornerRadius || 0.3;

    switch (content.layout) {
      case 'title':
        // Gradient accent blob top-right
        pptSlide.addShape('ellipse', {
          x: 8.5, y: -1.5, w: 6.0, h: 4.5,
          fill: { color: this.hex(colors.primary), transparency: 70 },
        });
        pptSlide.addShape('ellipse', {
          x: 10.0, y: -0.5, w: 4.0, h: 3.0,
          fill: { color: this.hex(colors.secondary), transparency: 80 },
        });

        pptSlide.addText(content.title, {
          x: 0.8, y: 2.2, w: '85%', h: 1.8,
          fontSize: 46, fontFace: theme.fonts.title,
          color: this.hex(colors.accent), bold: true, align: 'left',
        });

        if (content.subtitle) {
          pptSlide.addText(content.subtitle, {
            x: 0.8, y: 4.0, w: '85%', h: 0.8,
            fontSize: 22, fontFace: theme.fonts.body,
            color: this.hex(colors.textLight), align: 'left',
          });
        }
        break;

      case 'section-break':
        // Gradient overlay
        pptSlide.addShape('rect', {
          x: 0.8, y: 2.2, w: 11.73, h: 3.0,
          fill: { color: this.hex(colors.primary), transparency: 40 },
          rectRadius: radius,
        });
        pptSlide.addText(content.title, {
          x: 1.2, y: 2.8, w: '85%', h: 1.5,
          fontSize: 38, fontFace: theme.fonts.title,
          color: this.hex(colors.accent), bold: true, align: 'center',
        });
        break;

      case 'two-column':
        pptSlide.addText(content.title, {
          x: 0.8, y: 0.4, w: '85%', h: 1.0,
          fontSize: 32, fontFace: theme.fonts.title,
          color: this.hex(colors.accent), bold: true, align: 'left',
        });
        this.renderColumnBullets(pptSlide, content, theme, textColor, true, 1.6);
        break;

      case 'quote':
        pptSlide.addShape('ellipse', {
          x: 0.5, y: 1.0, w: 3.0, h: 3.0,
          fill: { color: this.hex(colors.primary), transparency: 60 },
        });
        pptSlide.addText('\u201C', {
          x: 1.0, y: 1.3, w: 1.5, h: 1.5,
          fontSize: 80, fontFace: theme.fonts.accent,
          color: this.hex(colors.accent),
        });
        pptSlide.addText(content.title || content.subtitle || '', {
          x: 1.5, y: 2.8, w: '75%', h: 2.5,
          fontSize: 28, fontFace: theme.fonts.accent,
          color: this.hex(colors.text), italic: true, align: 'center',
        });
        break;

      default:
        // Card background for content slides
        if (theme.layout.cardStyle) {
          pptSlide.addShape('roundRect', {
            x: 0.5, y: 0.3, w: 12.33, h: 6.5,
            fill: { color: this.hex(colors.primary), transparency: 75 },
            rectRadius: radius,
          });
        }

        pptSlide.addText(content.title, {
          x: 1.0, y: 0.5, w: '85%', h: 1.0,
          fontSize: 32, fontFace: theme.fonts.title,
          color: this.hex(colors.accent), bold: true, align: 'left',
        });

        // Accent underline
        pptSlide.addShape('line', {
          x: 1.0, y: 1.4, w: 2.0, h: 0,
          line: { color: this.hex(colors.secondary), width: 3 },
        });

        if (content.bullets && content.bullets.length > 0) {
          const emojiPrefixes = ['✨', '💡', '🚀', '🎯', '⭐', '🔥', '💎'];
          const bulletText = content.bullets.map((b: string, i: number) => ({
            text: `${emojiPrefixes[i % emojiPrefixes.length]}  ${b}`,
            options: {
              fontSize: 18, fontFace: theme.fonts.body,
              color: this.hex(colors.text), paraSpaceAfter: 10,
            },
          }));
          pptSlide.addText(bulletText, {
            x: 1.0, y: 1.8, w: '85%', h: 4.8,
            valign: 'top', lineSpacingMultiple: 1.4,
          });
        }
        break;
    }

    // Slide number
    pptSlide.addText(`${slideNum}`, {
      x: 12.0, y: 6.8, w: 0.8, h: 0.5,
      fontSize: 12, fontFace: theme.fonts.body,
      color: this.hex(colors.textLight), align: 'center',
    });
  }

  // ─── SHARED HELPERS ────────────────────────────────────

  private renderTitleBar(pptSlide: any, content: any, theme: ThemeLayout, textColor: string): void {
    pptSlide.addText(content.title, {
      x: 0.6, y: 0.4, w: '88%', h: 1.0,
      fontSize: 32, fontFace: theme.fonts.title,
      color: this.hex(textColor), bold: true, align: 'left',
    });
  }

  private renderColumnBullets(
    pptSlide: any, content: any, theme: ThemeLayout, textColor: string,
    showBullets: boolean, startY: number = 1.8
  ): void {
    if (!content.bullets || content.bullets.length === 0) return;

    const midpoint = Math.ceil(content.bullets.length / 2);
    const leftBullets = content.bullets.slice(0, midpoint);
    const rightBullets = content.bullets.slice(midpoint);

    const bulletOpts = (b: string) => ({
      text: b,
      options: {
        fontSize: 17, fontFace: theme.fonts.body,
        color: this.hex(textColor),
        bullet: showBullets,
        paraSpaceAfter: 6,
      },
    });

    if (leftBullets.length > 0) {
      pptSlide.addText(leftBullets.map(bulletOpts), {
        x: 0.6, y: startY, w: '44%', h: 5.0, valign: 'top',
      });
    }
    if (rightBullets.length > 0) {
      pptSlide.addText(rightBullets.map(bulletOpts), {
        x: 5.3, y: startY, w: '44%', h: 5.0, valign: 'top',
      });
    }
  }

  private addSlideNumber(pptSlide: any, slideNum: number, totalSlides: number, theme: ThemeLayout, colors: Record<string, string>): void {
    const pos = theme.layout.slideNumberPosition || 'bottom-right';
    let x = 12.0;
    if (pos === 'bottom-left') x = 0.5;
    if (pos === 'bottom-center') x = 6.0;

    pptSlide.addText(`${slideNum} / ${totalSlides}`, {
      x, y: 7.0, w: 1.5, h: 0.4,
      fontSize: 10, fontFace: theme.fonts.body,
      color: this.hex(colors.textLight), align: 'center',
    });
  }

  private hex(color: string): string {
    return color.replace('#', '');
  }
}