#!/usr/bin/env node

import { Command } from 'commander';
import * as dotenv from 'dotenv';
import { SlideHarness } from './harness';
import { logger } from './utils/logger';

dotenv.config();

const log = logger.child('CLI');

const program = new Command();

program
  .name('slide-harness')
  .description('AI-powered slide presentation generator using Harness Engineering')
  .version('1.0.0');

program
  .command('generate')
  .description('Generate a slide presentation from a topic')
  .requiredOption('-i, --input <topic>', 'Presentation topic or description')
  .option('-f, --file <path>', 'Read content from a markdown file')
  .option('-t, --theme <theme>', 'Slide theme (modern|minimal|corporate|creative)', 'modern')
  .option('-l, --language <lang>', 'Language code (vi|en|ja|ko)', 'vi')
  .option('-m, --max-slides <number>', 'Maximum number of slides', '20')
  .option('-a, --aspect-ratio <ratio>', 'Aspect ratio (16:9|4:3)', '16:9')
  .option('-o, --output <path>', 'Output file path', 'presentation.pptx')
  .option('--no-fallback', 'Disable auto-fallback to alternative models')
  .action(async (options) => {
    try {
      console.log('\n🎯 Slide Harness - AI Presentation Generator');
      console.log('='.repeat(50));
      console.log(`📝 Topic: ${options.input}`);
      console.log(`🎨 Theme: ${options.theme}`);
      console.log(`🌐 Language: ${options.language}`);
      console.log(`📊 Max slides: ${options.maxSlides}`);
      console.log(`📐 Aspect ratio: ${options.aspectRatio}`);
      console.log('='.repeat(50));

      // Read from file if specified
      let topic = options.input;
      if (options.file) {
        const fs = require('fs');
        if (fs.existsSync(options.file)) {
          topic = fs.readFileSync(options.file, 'utf-8');
          console.log(`📄 Reading content from: ${options.file}`);
        } else {
          console.error(`❌ File not found: ${options.file}`);
          process.exit(1);
        }
      }

      const harness = new SlideHarness({
        baseUrl: process.env.LLM_BASE_URL || 'http://localhost:3000',
        apiKey: process.env.LLM_API_KEY,
        model: {
          content: process.env.LLM_MODEL || 'claude-3.5-sonnet',
          image: process.env.LLM_IMAGE_MODEL || 'dall-e-3',
          fallback: process.env.LLM_FALLBACK_MODEL || 'gpt-4o',
        },
        theme: options.theme,
        guardrails: {
          maxSlides: parseInt(options.maxSlides, 10),
          brandCompliance: true,
        },
      });

      console.log('\n⏳ Generating presentation...\n');

      // Generate presentation
      const presentation = await harness.generate({
        topic,
        style: options.theme,
        language: options.language,
        maxSlides: parseInt(options.maxSlides, 10),
        aspectRatio: options.aspectRatio as '16:9' | '4:3',
        theme: options.theme,
      });

      console.log('\n✅ Presentation generated successfully!');
      console.log(`   📊 Slides: ${presentation.slides.length}`);
      console.log(`   ✅ Valid: ${presentation.isValid ? 'Yes' : 'No'}`);

      if (!presentation.isValid) {
        console.log(`   ⚠️  Errors: ${presentation.validationErrors.length}`);
        presentation.validationErrors.forEach(e => console.log(`      - ${e}`));
      }

      // Export to PPTX
      console.log(`\n📦 Exporting to: ${options.output}`);
      const outputPath = await harness.export(presentation, options.output);
      console.log(`   ✅ Exported to: ${outputPath}`);

      // Show metrics
      const metrics = harness.getMetrics();
      console.log('\n📈 Metrics:');
      console.log(`   Success rate: ${(metrics.successRate * 100).toFixed(1)}%`);
      console.log(`   Avg generation time: ${metrics.avgGenerationTime.toFixed(0)}ms`);
      console.log(`   Retry rate: ${(metrics.retryRate * 100).toFixed(1)}%`);

      console.log('\n🎉 Done!\n');
    } catch (error) {
      console.error('\n❌ Error:', error instanceof Error ? error.message : error);
      log.error('CLI error', { error });
      process.exit(1);
    }
  });

program.parse();