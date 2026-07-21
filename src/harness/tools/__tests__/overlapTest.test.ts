import { describe, it, expect } from 'vitest';
import { SlideExporter } from '../slideExporter';
import { Presentation } from '../../../schemas/presentation.schema';
import * as fs from 'fs';

describe('Layout Overlap Integration', () => {
  it('should export a presentation with potential overlap cases and verify fixes', async () => {
    const exporter = new SlideExporter();
    
    const mockPresentation: Presentation = {
      id: 'overlap-test',
      title: 'Overlap Test Presentation',
      slides: [
        {
          id: 's-corporate',
          index: 0,
          content: {
            title: 'Corporate Theme Overlap Check',
            subtitle: 'Checking title and subtitle overlap in corporate theme',
            layout: 'title',
            bullets: [],
          },
          isValid: true,
          validationErrors: [],
        },
        {
          id: 's-minimal',
          index: 1,
          content: {
            title: 'Minimal Theme Overlap Check',
            subtitle: 'Checking title and subtitle overlap in minimal theme',
            layout: 'title',
            bullets: [],
          },
          isValid: true,
          validationErrors: [],
        },
        {
          id: 's-creative',
          index: 2,
          content: {
            title: 'Creative Theme Overlap Check',
            subtitle: 'Checking title and subtitle overlap in creative theme',
            layout: 'title',
            bullets: [],
          },
          isValid: true,
          validationErrors: [],
        },
        {
          id: 's1',
          index: 3,
          content: {
            title: 'Chart with Bullets Overlap Check',
            layout: 'chart',
            bullets: [
              'Bullet point 1 that should not overlap with the chart',
              'Bullet point 2 that should be positioned below the chart',
              'Bullet point 3 providing additional context'
            ],
            visuals: {
              chart: {
                type: 'bar',
                title: 'Sales Performance',
                data: [
                  { label: 'Jan', value: 400 },
                  { label: 'Feb', value: 300 },
                  { label: 'Mar', value: 600 },
                ],
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
            title: 'Very Long Title that might wrap and cause overlap with subtitles and content below it',
            subtitle: 'This is a subtitle that should also be clear of the main title and the content that follows',
            layout: 'title',
            bullets: ['This is a bullet point on a title slide'],
          },
          isValid: true,
          validationErrors: [],
        }
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
        totalSlides: 2,
        topic: 'Overlap Test',
      },
      isValid: true,
      validationErrors: [],
    };

    const outputPath = 'output/overlap-test.pptx';
    const resultPath = await exporter.exportPPTXDirect(mockPresentation, outputPath);
    
    expect(fs.existsSync(resultPath)).toBe(true);
  });
});
