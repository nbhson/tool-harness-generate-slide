# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-10-31

### Fixed

- `Validators.validateHTML`: corrected open/close tag counting regex that merged consecutive open tags and miscounted self-closing tags
- `WorkerPool`: worker script now runs with `eval: true` and absolute require paths (previously the temp-file script could not resolve modules); removed all inline `require()` calls in favor of static/dynamic ES imports

### Added

- Unit tests (vitest) for previously uncovered modules: TextChunker, TokenCounter, custom error classes, CLI option validators, Input/Deck/Output guardrails, WorkingMemory, ShortTermMemory, LongTermMemory, PermissionManager, FeedbackLoop, Validators (HTML/CSS/slide/deck), WorkerPool (main-thread fallback), shared test fixtures — suite grows from 38 to 157 tests across 23 files

### Changed

- ESLint config: `no-console` disabled for the CLI entry point (`src/index.ts`), which is the sanctioned place for user-facing output alongside the logger
- Dependencies: `@types/node` 26.1.1 → 26.6.6, `tsx` 4.23.1 → 4.23.15 (in-range, safe)

### Skipped dependency upgrades (major versions, breaking)

- `eslint` / `@eslint/js` 9 → 10, `typescript` 5 → 7, `vitest` 4 → 5, `dotenv` 17 → 18, `globals` 15 → 17

## [1.0.0] - 2026-10-27

### Added

- Initial release of Tool Slide Harness
- Multi-agent pipeline: PlannerAgent → DesignerAgent → EvaluatorAgent
- 9 slide themes: modern, minimal, corporate, creative, bold, elegant, gradient, ocean, tech
- 12 specialized slide layouts: chart, stats, timeline, flowchart, infographic, image-grid, video, code, faq, testimonial, pricing, table
- Guardrails system: input, slide, deck, and output validation
- Memory system: short-term, working, and long-term memory
- Feedback loop with auto-retry (max 3 attempts)
- Performance optimizations:
  - Parallel batch slide generation (~4.4x faster)
  - Smart retry (only failed slides redesigned, ~2x faster retry)
  - ConcurrencyPool with adaptive throttling
  - Circuit breaker for LLM failover
  - Request coalescing for duplicate in-flight requests
  - Worker threads for CPU-bound PPTX export
  - Smart text chunking for long documents
- CLI with options: input, file, theme, language, max-slides, aspect-ratio, output, no-fallback
- Emoji icon system (100+ icon mappings)
- Intelligent chart type detection
- Visual export integration tests

### Developer Experience

- ESLint flat config with strict TypeScript rules
- Prettier code formatting
- Custom error classes with structured error codes
- Input validation for CLI options
- JSDoc documentation for public APIs
- Comprehensive test suite (9 test files)
