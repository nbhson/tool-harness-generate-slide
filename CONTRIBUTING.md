# Contributing to Tool Slide Harness

Thank you for considering contributing to Tool Slide Harness! 🎉

## Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/<your-username>/tool-slide-harness.git
   cd tool-slide-harness
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Set up environment:
   ```bash
   cp .env.example .env
   # Edit .env with your LLM configuration
   ```

## Development Workflow

1. Create a branch for your feature:

   ```bash
   git checkout -b feature/amazing-feature
   ```

2. Make your changes

3. Run the linter and formatter:

   ```bash
   npm run lint:fix
   npm run format
   ```

4. Run tests:

   ```bash
   npm test
   ```

5. Commit your changes:

   ```bash
   git commit -m "Add amazing feature"
   ```

6. Push to your fork:

   ```bash
   git push origin feature/amazing-feature
   ```

7. Open a Pull Request

## Code Style

- **TypeScript**: Strict mode enabled
- **Linting**: ESLint with `@typescript-eslint` rules
- **Formatting**: Prettier (single quotes, semicolons, trailing commas, 100 char width)
- **Naming**:
  - `PascalCase` for classes, interfaces, types
  - `camelCase` for functions, variables
  - `SCREAMING_SNAKE_CASE` for constants

### Before Submitting

Run these commands and ensure they pass:

```bash
npm run lint          # No ESLint errors
npm run format:check  # Prettier formatting is correct
npm run build         # TypeScript compiles without errors
npm test              # All tests pass
```

## Project Structure

```
src/
├── index.ts              # CLI entry point
├── agents/               # Multi-agent system (planner, designer, evaluator)
├── harness/              # Core harness system
│   ├── guardrails/       # Validation rules
│   ├── memory/           # Memory system
│   ├── context/          # Context management
│   ├── feedback/         # Feedback loops
│   ├── permissions/      # Permission management
│   └── tools/            # LLM content generation, PPTX export
├── schemas/              # Data schemas
├── templates/            # Slide themes (JSON)
└── utils/                # Utilities (logger, concurrency, errors, etc.)
```

## Reporting Bugs

1. Check existing issues first
2. Create a new issue with:
   - Clear title and description
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details (Node.js version, OS)
   - Relevant logs (set `LOG_LEVEL=DEBUG`)

## Suggesting Features

1. Open an issue with the `enhancement` label
2. Describe the feature and its use case
3. Explain why it fits the project's Harness Engineering philosophy

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
