import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/** @type {import('eslint').Linter.Config[]} */
export default [
  // Base ESLint recommended rules
  eslint.configs.recommended,

  // TypeScript files
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      // TypeScript-specific rules
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      // Disable base no-unused-vars (typescript-eslint handles it properly)
      'no-unused-vars': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-inferrable-types': 'off',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
        },
      ],
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-expect-error': 'allow-with-description',
          'ts-ignore': 'allow-with-description',
          'ts-nocheck': 'allow-with-description',
        },
      ],

      // Disallow unused expressions
      'no-unused-expressions': [
        'error',
        {
          allowShortCircuit: true,
          allowTernary: true,
        },
      ],

      // Consistent indentation
      indent: ['error', 2],

      // Consistent quote style
      quotes: ['error', 'single', { avoidEscape: true }],

      // No trailing whitespace
      'no-trailing-spaces': 'error',

      // Consistent semicolons
      semi: ['error', 'always'],

      // No console.log in production code
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      // No debugger
      'no-debugger': 'error',

      // Prefer const over let
      'prefer-const': 'error',

      // No var
      'no-var': 'error',

      // Brace style
      'brace-style': ['error', '1tbs'],

      // Comma dangle
      'comma-dangle': ['error', 'always-multiline'],

      // Object spacing
      'object-curly-spacing': ['error', 'always'],

      // Array spacing
      'array-bracket-spacing': ['error', 'never'],

      // Arrow spacing
      'arrow-spacing': ['error', { before: true, after: true }],

      // Import order (alphabetical within groups; too disruptive to enforce strictly on legacy code)
      'sort-imports': [
        'error',
        {
          memberSyntaxSortOrder: ['none', 'all', 'single', 'multiple'],
          ignoreCase: true,
          ignoreDeclarationSort: true,
          ignoreMemberSort: false,
        },
      ],

      // Consistent newlines
      'newline-per-chained-call': ['warn', { ignoreChainWithDepth: 3 }],
    },
  },

  // Test files (more lenient)
  {
    files: ['**/__tests__/**/*.ts', '**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },

  // Logger is the sanctioned place for console output
  {
    files: ['src/utils/logger.ts'],
    rules: {
      'no-console': 'off',
    },
  },

  // Disable some rules that conflict with Prettier
  prettier,

  // Ignore patterns
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', '**/*.js', '**/output/**'],
  },
];
