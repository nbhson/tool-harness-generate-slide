#!/usr/bin/env node

import { Command } from 'commander';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import { SlideHarness } from './harness';
import { logger } from './utils/logger';
import { formatError, isSlideHarnessError } from './utils/errors';
import {
  getErrorHint,
  getExitCode,
} from './utils/exitCodes';
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

const HELP_EXAMPLES = `
Examples:
  $ slide-harness generate -i "Giới thiệu sản phẩm ABC" -t modern
  $ slide-harness generate -i "Report" -f content.md -t corporate -o report.pptx
  $ slide-harness generate -i "Quarterly Review" -t corporate -m 15 -l en -o q4.pptx
  $ slide-harness generate -i "Pitch deck" --dry-run        # chỉ validate, không gọi LLM

Exit codes:
  0  thành công (kể cả --dry-run)
  1  lỗi không xác định
  2  lỗi input (option sai, file không tồn tại, guardrails chặn)
  3  lỗi LLM (không kết nối được / cả primary và fallback fail)
  4  lỗi export (không ghi được file PPTX)

Environment (.env):
  LLM_BASE_URL        OpenAI-compatible endpoint (mặc định http://localhost:3000)
  LLM_API_KEY         API key (nếu có)
  LLM_MODEL           model chính (mặc định claude-3.5-sonnet)
  LLM_FALLBACK_MODEL  model dự phòng (mặc định gpt-4o)
`;

const program = new Command();

program
  .name('slide-harness')
  .description('AI-powered slide presentation generator using Harness Engineering')
  .version('1.0.0')
  .addHelpText('after', HELP_EXAMPLES);

interface GenerateCliOptions {
  input: string;
  file?: string;
  theme: string;
  language: string;
  maxSlides: string;
  aspectRatio: string;
  output: string;
  fallback: boolean;
  verbose: boolean;
  quiet: boolean;
  dryRun: boolean;
}

const STAGE_LABELS: Record<string, string> = {
  planning: 'Lập kế hoạch (planning)',
  design: 'Thiết kế slide (design)',
  assembly: 'Lắp ráp presentation (assembly)',
  evaluation: 'Đánh giá chất lượng (evaluation)',
  retry: 'Retry slide lỗi (smart retry)',
  export: 'Xuất file PPTX (export)',
};

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
  .option(
    '--dry-run',
    'Validate input và in plan (theme, ngôn ngữ, số slide, output) — không gọi LLM, không ghi file',
    false,
  )
  .action(async (options: GenerateCliOptions) => {
    // Configure logging verbosity
    if (options.verbose) {
      process.env.LOG_LEVEL = 'DEBUG';
    }

    const quiet = Boolean(options.quiet);
    const print = (msg: string): void => {
      if (!quiet) console.log(msg);
    };

    const exitWithError = (error: unknown): never => {
      const code = getExitCode(error);
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
      const hint = getErrorHint(error);
      if (hint) {
        console.error(`   💡 ${hint}`);
      }
      return process.exit(code) as never;
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
          return exitWithError(
            new OptionValidationError(
              `File not found: ${options.file}`,
              'file',
              options.file,
              'Đường dẫn tới file markdown tồn tại',
            ),
          );
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
      print(`📦 Output: ${outputPath}`);

      // --dry-run: chỉ validate input + in plan, không gọi LLM, không ghi file
      if (options.dryRun) {
        print('='.repeat(50));
        print('\n🔍 DRY RUN — input hợp lệ, không gọi LLM, không ghi file.');
        print('   Plan sẽ thực hiện:');
        print('   1. Planning   — tạo outline từ topic (LLM)');
        print('   2. Design     — sinh nội dung từng slide song song (LLM)');
        print('   3. Evaluation — guardrails kiểm tra slide + deck');
        print(`   4. Export     — ghi PPTX ra ${outputPath}`);
        print('\n✅ Dry run thành công. Bỏ --dry-run để chạy thật.\n');
        return;
      }

      print('='.repeat(50));
      print(`🛟 Fallback model: ${options.fallback ? 'bật' : 'tắt'}`);

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

      // Progress per stage
      let stageStep = 0;
      const TOTAL_STAGES = 5;
      const onStage = (stage: string, detail?: string): void => {
        stageStep++;
        const label = STAGE_LABELS[stage] || stage;
        print(`📋 [${stageStep}/${TOTAL_STAGES}] ${label}${detail ? ` — ${detail}` : '...'}`);
      };

      print('\n⏳ Generating presentation...\n');

      const presentation = await harness.generate(
        {
          topic: validatedTopic,
          style: theme,
          language,
          maxSlides,
          aspectRatio,
          theme,
        },
        { onStage },
      );

      print('\n✅ Presentation generated successfully!');
      print(`   📊 Slides: ${presentation.slides.length}`);
      print(`   ✅ Valid: ${presentation.isValid ? 'Yes' : 'No'}`);

      if (!presentation.isValid) {
        print(`   ⚠️  Errors: ${presentation.validationErrors.length}`);
        presentation.validationErrors.forEach((e) => print(`      - ${e}`));
      }

      onStage('export');
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
      exitWithError(error);
    }
  });

program.parse();
