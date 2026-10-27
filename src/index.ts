#!/usr/bin/env node

import { Command } from 'commander';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import { SlideHarness } from './harness';
import { logger } from './utils/logger';
import { formatError, isSlideHarnessError } from './utils/errors';
import {
  OptionValidationError,
  validateAspectRatio,
  validateLanguage,
  validateMaxSlides,
  validateOutputPath,
  validateTheme,
  validateTopic,
} from './utils/validators';

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
  .option(
    '-t, --theme <theme>',
    'Slide theme (modern|minimal|corporate|creative|bold|elegant|gradient|ocean|tech)',
    'modern',
  )
  .option('-l, --language <lang>', 'Language code (vi|en|ja|ko)', 'vi')
  .option('-m, --max-slides <number>', 'Maximum number of slides (1-50)', '20')
  .option('-a, --aspect-ratio <ratio>', 'Aspect ratio (16:9|4:3)', '16:9')
  .option('-o, --output <path>', 'Output file path (.pptx)', 'presentation.pptx')
  .option('--no-fallback', 'Disable auto-fallback to alternative models')
  .option('--verbose', 'Enable verbose (DEBUG) logging')
  .option('--quiet', 'Suppress non-essential output (errors only)')
  .action(async (options) => {
    // Configure logging verbosity
    if (options.verbose) {
      process.env.LOG_LEVEL = 'DEBUG';
    }

    const quiet = Boolean(options.quiet);
    const print = (msg: string): void => {
      if (!quiet) console.log(msg);
    };

    try {
      // Validate all options upfront
      const theme = validateTheme(options.theme);
      const language = validateLanguage(options.language);
      const aspectRatio = validateAspectRatio(options.aspectRatio);
      const maxSlides = validateMaxSlides(options.maxSlides);
      const outputPath = validateOutputPath(options.output);

      // Resolve topic (from --input or --file)
      let topic = options.input;
      if (options.file) {
        if (!fs.existsSync(options.file)) {
          console.error(`❌ File not found: ${options.file}`);
          process.exit(1);
        }
        topic = fs.readFileSync(options.file, 'utf-8');
        print(`📄 Reading content from: ${options.file}`);
      }

      const validatedTopic = validateTopic(topic);

      print('\n🎯 Slide Harness - AI Presentation Generator');
      print('='.repeat(50));
      print(
        `📝 Topic: ${validatedTopic.split('\n')[0].substring(0, 80)}${validatedTopic.length > 80 ? '...' : ''}`,
      );
      print(`🎨 Theme: ${theme}`);
      print(`🌐 Language: ${language}`);
      print(`📊 Max slides: ${maxSlides}`);
      print(`📐 Aspect ratio: ${aspectRatio}`);
      print('='.repeat(50));

      const harness = new SlideHarness({
        baseUrl: process.env.LLM_BASE_URL || 'http://localhost:3000',
        apiKey: process.env.LLM_API_KEY,
        model: {
          content: process.env.LLM_MODEL || 'claude-3.5-sonnet',
          image: process.env.LLM_IMAGE_MODEL || 'dall-e-3',
          fallback: process.env.LLM_FALLBACK_MODEL || 'gpt-4o',
        },
        theme,
        guardrails: {
          maxSlides,
          brandCompliance: true,
        },
      });

      print('\n⏳ Generating presentation...\n');

      const presentation = await harness.generate({
        topic: validatedTopic,
        style: theme,
        language,
        maxSlides,
        aspectRatio,
        theme,
      });

      print('\n✅ Presentation generated successfully!');
      print(`   📊 Slides: ${presentation.slides.length}`);
      print(`   ✅ Valid: ${presentation.isValid ? 'Yes' : 'No'}`);

      if (!presentation.isValid) {
        print(`   ⚠️  Errors: ${presentation.validationErrors.length}`);
        presentation.validationErrors.forEach((e) => print(`      - ${e}`));
      }

      print(`\n📦 Exporting to: ${outputPath}`);
      const finalPath = await harness.export(presentation, outputPath);
      print(`   ✅ Exported to: ${finalPath}`);

      const metrics = harness.getMetrics();
      print('\n📈 Metrics:');
      print(`   Success rate: ${(metrics.successRate * 100).toFixed(1)}%`);
      print(`   Avg generation time: ${metrics.avgGenerationTime.toFixed(0)}ms`);
      print(`   Retry rate: ${(metrics.retryRate * 100).toFixed(1)}%`);

      print('\n🎉 Done!\n');
    } catch (error) {
      if (error instanceof OptionValidationError) {
        console.error(`\n❌ Invalid option: ${error.message}`);
        if (error.expected) {
          console.error(`   Expected: ${error.expected}`);
        }
      } else {
        console.error(`\n❌ Error: ${error instanceof Error ? error.message : error}`);
        if (isSlideHarnessError(error)) {
          console.error(`   Code: ${error.code}`);
        }
        log.error('CLI error', { error: formatError(error) });
      }
      process.exit(1);
    }
  });

program.parse();
