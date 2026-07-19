import { describe, it, expect } from 'vitest';
import { SlideExporter } from '../slideExporter';
import { Presentation } from '../../../schemas/presentation.schema';

describe('SlideExporter', () => {
  describe('parseMarkdownToRuns', () => {
    it('should parse bold markdown text into formatted PPTX text runs', () => {
      const input = '**Heading**: Supporting detail text';
      const baseOpts = { fontSize: 16, color: '#1A1A2E' };
      const runs = SlideExporter.parseMarkdownToRuns(input, baseOpts, '#0066CC');

      expect(runs.length).toBe(2);
      expect(runs[0]).toEqual({
        text: 'Heading',
        options: {
          fontSize: 16,
          color: '#0066CC',
          bold: true,
        },
      });
      expect(runs[1]).toEqual({
        text: ': Supporting detail text',
        options: {
          fontSize: 16,
          color: '#1A1A2E',
        },
      });
    });

    it('should parse italic markdown text into italic PPTX text runs', () => {
      const input = 'Normal text *italic text* normal again';
      const baseOpts = { fontSize: 14, color: '#333333' };
      const runs = SlideExporter.parseMarkdownToRuns(input, baseOpts);

      expect(runs.length).toBe(3);
      expect(runs[1]).toEqual({
        text: 'italic text',
        options: {
          fontSize: 14,
          color: '#333333',
          italic: true,
        },
      });
    });

    it('should handle plain text gracefully', () => {
      const input = 'Plain text with no formatting';
      const baseOpts = { fontSize: 18, color: '#000000' };
      const runs = SlideExporter.parseMarkdownToRuns(input, baseOpts);

      expect(runs.length).toBe(1);
      expect(runs[0].text).toBe('Plain text with no formatting');
    });
  });

  describe('cleanMarkdownText', () => {
    it('should strip markdown headers, markdown links, double bullet markers, and orphan link brackets', () => {
      expect(SlideExporter.cleanMarkdownText('### So Sánh: Tổng Quan')).toBe('So Sánh: Tổng Quan');
      expect(SlideExporter.cleanMarkdownText('• - [Harness Engineering: Kỹ Thuật AI](#harness-engineering)')).toBe('Harness Engineering: Kỹ Thuật AI');
      expect(SlideExporter.cleanMarkdownText('[Mục Lục](#mục-lục)')).toBe('Mục Lục');
      expect(SlideExporter.cleanMarkdownText('Giới Thiệu](#1-giới-thiệu)')).toBe('Giới Thiệu');
      expect(SlideExporter.cleanMarkdownText('- - Bullet text')).toBe('Bullet text');
    });
  });

  describe('sanitizeBullets', () => {
    it('should sanitize and enrich array of bullet strings', () => {
      const input = [
        '### So Sánh: Tổng Quan',
        '• - [Harness Engineering](#anchor)',
        '[Mục Lục](#mục-lục)',
      ];
      const result = SlideExporter.sanitizeBullets(input);
      expect(result.length).toBe(3);
      expect(result[0]).toContain('So Sánh: Tổng Quan');
      expect(result[1]).toContain('Harness Engineering');
      expect(result[2]).toContain('Mục Lục');
      expect(result[0].length).toBeGreaterThan(40);
    });
  });

  describe('parseBulletItem', () => {
    it('should parse bullet item with bold header and colon separator', () => {
      const input = '**Độ tin cậy cao**: Hệ thống đạt 99.9% uptime';
      const result = SlideExporter.parseBulletItem(input);
      expect(result).toEqual({
        header: 'Độ tin cậy cao',
        body: 'Hệ thống đạt 99.9% uptime',
      });
    });

    it('should parse bullet item with bold header and space separator', () => {
      const input = '**Tối ưu chi phí** Giảm 30% tài nguyên cloud';
      const result = SlideExporter.parseBulletItem(input);
      expect(result).toEqual({
        header: 'Tối ưu chi phí',
        body: 'Giảm 30% tài nguyên cloud',
      });
    });

    it('should handle plain text without header gracefully', () => {
      const input = 'Nội dung chi tiết giải trình cho trang slide';
      const result = SlideExporter.parseBulletItem(input);
      expect(result).toEqual({
        header: '',
        body: 'Nội dung chi tiết giải trình cho trang slide',
      });
    });
  });

  describe('exportPPTXDirect', () => {
    it('should export presentation to PPTX file without errors', async () => {
      const exporter = new SlideExporter();
      const mockPresentation: Presentation = {
        id: 'test-pres-1',
        title: 'Test Presentation',
        slides: [
          {
            id: 'slide-1',
            index: 0,
            content: {
              title: 'Slide 1 Title',
              subtitle: 'Subtitle for slide 1',
              bullets: ['**Key Concept 1**: Detail 1', '**Key Concept 2**: Detail 2'],
              layout: 'title-bullets',
            },
            isValid: true,
            validationErrors: [],
          },
          {
            id: 'slide-2',
            index: 1,
            content: {
              title: 'Comparison Slide',
              bullets: ['**Option A**: Advantage A', '**Option B**: Advantage B'],
              layout: 'comparison',
            },
            isValid: true,
            validationErrors: [],
          },
          {
            id: 'slide-3',
            index: 2,
            content: {
              title: 'Bảng So Sánh Chi Tiết',
              bullets: [],
              layout: 'table',
              table: {
                headers: ['Tiêu chí', 'Giải pháp A', 'Giải pháp B'],
                rows: [
                  ['Chi phí', 'Thấp ($10k)', 'Trung bình ($25k)'],
                  ['Hiệu năng', '99.5%', '99.99%'],
                ],
              },
            },
            isValid: true,
            validationErrors: [],
          },
        ],
        theme: {
          name: 'modern',
          colors: {
            primary: '#0066CC',
            secondary: '#004999',
            accent: '#00AAFF',
            background: '#FFFFFF',
            text: '#1A1A2E',
            textLight: '#666666',
          },
          fonts: {
            title: 'Arial',
            body: 'Arial',
            accent: 'Georgia',
          },
          layout: {
            width: 13.33,
            height: 7.5,
            padding: { top: 0.5, left: 0.6, right: 0.6, bottom: 0.5 },
          },
        },
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          language: 'vi',
          aspectRatio: '16:9',
          totalSlides: 2,
          topic: 'Test',
        },
        isValid: true,
        validationErrors: [],
      };

      const outputPath = 'output/test_export.pptx';
      const resultPath = await exporter.exportPPTXDirect(mockPresentation, outputPath);
      expect(resultPath).toContain('test_export.pptx');
    });
  });
});
