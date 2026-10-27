import { describe, expect, it } from 'vitest';
import { SlideExporter } from '../slideExporter';
import { ContentGenerator } from '../contentGenerator';
import type { Presentation } from '../../../schemas/presentation.schema';
import * as fs from 'fs';

describe('Visual Export Integration', () => {
  describe('ContentGenerator parsing', () => {
    it('should parse outline with nested bullets array correctly using balanced JSON parser', () => {
      const generator = new ContentGenerator({
        baseUrl: 'http://localhost:11434',
        apiKey: '',
        model: 'qwen2.5:7b',
        fallbackModel: 'qwen2.5:7b',
      });

      // Simulate LLM response with nested bullets arrays (previously broke non-greedy regex)
      const response = `[
  {"title":"Introduction","layout":"title-bullets","bullets":["**Overview**: Detailed intro","**Goal**: Main objective"]},
  {"title":"Architecture","layout":"chart","bullets":["**Component A**: First system","**Component B**: Second system","**Component C**: Third system"]}
]`;

      const plans = (generator as any).parseOutlineResponse(response);

      expect(plans.length).toBe(2);
      expect(plans[0].title).toBe('Introduction');
      expect(plans[0].bullets.length).toBe(2);
      expect(plans[1].title).toBe('Architecture');
      expect(plans[1].layout).toBe('chart');
      expect(plans[1].bullets.length).toBe(3);
    });

    it('should enforce visual variety in long outlines', () => {
      const generator = new ContentGenerator({
        baseUrl: 'http://localhost:11434',
        apiKey: '',
        model: 'qwen2.5:7b',
        fallbackModel: 'qwen2.5:7b',
      });

      // Create a long outline with 25 text slides
      const plans = Array.from({ length: 25 }, (_, i) => ({
        title: `Slide ${i + 1}`,
        layout: i === 0 ? ('title' as const) : ('title-bullets' as const),
        bullets: [`**Point**: Content for slide ${i + 1}`],
      }));

      const result = (generator as any).ensureOutlineVisualVariety(plans);

      // Should have enforced at least chart, table, stats, image-grid, flowchart, timeline
      const layouts = result.map((p: any) => p.layout);
      expect(layouts).toContain('chart');
      expect(layouts).toContain('table');
      expect(layouts).toContain('stats');
      expect(layouts).toContain('image-grid');
      expect(layouts).toContain('flowchart');
      expect(layouts).toContain('timeline');

      // Title slide should remain unchanged
      expect(result[0].layout).toBe('title');
    });
  });

  describe('SlideExporter chart series normalization', () => {
    it('should convert simple {label,value} data to PptxGenJS series format', () => {
      const exporter = new SlideExporter();

      const chart = {
        type: 'bar',
        title: 'Performance Metrics',
        data: [
          { label: 'Q1', value: 100 },
          { label: 'Q2', value: 150 },
          { label: 'Q3', value: 120 },
        ],
      };

      const series = (exporter as any).toPptxChartSeries(chart);

      expect(series.length).toBe(1);
      expect(series[0].name).toBe('Performance Metrics');
      expect(series[0].labels).toEqual(['Q1', 'Q2', 'Q3']);
      expect(series[0].values).toEqual([100, 150, 120]);
    });

    it('should handle multi-series data correctly', () => {
      const exporter = new SlideExporter();

      const chart = {
        type: 'line',
        title: 'Multi-series',
        data: [
          { month: 'Jan', sales: 100, costs: 80 },
          { month: 'Feb', sales: 150, costs: 90 },
        ],
      };

      const series = (exporter as any).toPptxChartSeries(chart);

      expect(series.length).toBe(2);
      expect(series[0].name).toBe('sales');
      expect(series[0].labels).toEqual(['Jan', 'Feb']);
      expect(series[0].values).toEqual([100, 150]);
      expect(series[1].name).toBe('costs');
      expect(series[1].values).toEqual([80, 90]);
    });

    it('should pass through already-formatted PptxGenJS series data', () => {
      const exporter = new SlideExporter();

      const chart = {
        type: 'bar',
        data: [
          { name: 'Series A', labels: ['X', 'Y'], values: [10, 20] },
          { name: 'Series B', labels: ['X', 'Y'], values: [15, 25] },
        ],
      };

      const series = (exporter as any).toPptxChartSeries(chart);

      expect(series.length).toBe(2);
      expect(series[0]).toEqual({ name: 'Series A', labels: ['X', 'Y'], values: [10, 20] });
      expect(series[1]).toEqual({ name: 'Series B', labels: ['X', 'Y'], values: [15, 25] });
    });
  });

  describe('PPTX visual object export', () => {
    it('should export corporate presentation with chart, table, and image-grid layouts', async () => {
      const exporter = new SlideExporter();

      const mockPresentation: Presentation = {
        id: 'visual-test',
        title: 'Visual Export Test',
        slides: [
          {
            id: 's1',
            index: 0,
            content: {
              title: 'Chart Slide',
              layout: 'chart',
              bullets: [],
              visuals: {
                chart: {
                  type: 'bar',
                  title: 'Sales Data',
                  data: [
                    { label: 'Q1', value: 100 },
                    { label: 'Q2', value: 150 },
                    { label: 'Q3', value: 120 },
                  ],
                  colors: ['#0066CC', '#00AAFF'],
                },
              },
            },
            isValid: true,
            validationErrors: [],
          },
          {
            id: 's2',
            index: 1,
            content: {
              title: 'Table Slide',
              layout: 'table',
              bullets: [],
              table: {
                headers: ['Feature', 'Plan A', 'Plan B'],
                rows: [
                  ['Storage', '10GB', '100GB'],
                  ['Users', '5', 'Unlimited'],
                ],
              },
            },
            isValid: true,
            validationErrors: [],
          },
          {
            id: 's3',
            index: 2,
            content: {
              title: 'Image Grid',
              layout: 'image-grid',
              bullets: [],
              visuals: {
                images: [
                  {
                    base64:
                      'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MDAiIGhlaWdodD0iNTIwIj48cmVjdCB3aWR0aD0iODAwIiBoZWlnaHQ9IjUyMCIgZmlsbD0iIzI1NjNFQiIvPjx0ZXh0IHg9IjQwMCIgeT0iMjYwIiBmaWxsPSIjZmZmIiBmb250LXNpemU9IjQ4IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5JbWFnZSAxPC90ZXh0Pjwvc3ZnPg==',
                    alt: 'Image 1',
                  },
                  {
                    base64:
                      'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MDAiIGhlaWdodD0iNTIwIj48cmVjdCB3aWR0aD0iODAwIiBoZWlnaHQ9IjUyMCIgZmlsbD0iIzA1OTY2OSIvPjx0ZXh0IHg9IjQwMCIgeT0iMjYwIiBmaWxsPSIjZmZmIiBmb250LXNpemU9IjQ4IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5JbWFnZSAyPC90ZXh0Pjwvc3ZnPg==',
                    alt: 'Image 2',
                  },
                ],
              },
            },
            isValid: true,
            validationErrors: [],
          },
        ],
        theme: {
          name: 'corporate',
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
            accent: 'Arial',
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
          language: 'en',
          aspectRatio: '16:9',
          totalSlides: 3,
          topic: 'Visual Test',
        },
        isValid: true,
        validationErrors: [],
      };

      const outputPath = 'output/visual-test.pptx';
      const resultPath = await exporter.exportPPTXDirect(mockPresentation, outputPath);

      expect(resultPath).toContain('visual-test.pptx');
      expect(fs.existsSync(resultPath)).toBe(true);

      // Basic file size check - should be >10KB with actual visual objects
      const stats = fs.statSync(resultPath);
      expect(stats.size).toBeGreaterThan(10000);
    });
  });
});
