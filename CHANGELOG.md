# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
