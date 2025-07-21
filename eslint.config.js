// @ts-check
import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  // ==== Ignore Patterns ====
  // Files and directories to exclude from linting
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/*.d.ts',
      'docker/**',
      'test-*.js',
      'test-*.mjs',
      '**/tests/**',
      // Note: scripts/** removed - now linted per lint-staged config
    ],
  },

  // ==== Base Configurations ====
  // ESLint recommended rules
  eslint.configs.recommended,

  // TypeScript-ESLint recommended rules
  ...tseslint.configs.recommended,

  // ==== Main Configuration ====
  // Custom rules and settings for the project
  {
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        // Bun runtime globals
        Bun: 'readonly',
        
        // Web platform globals (available in Bun)
        fetch: 'readonly',
        Response: 'readonly',
        Request: 'readonly',
        Headers: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        FormData: 'readonly',
        Blob: 'readonly',
        
        // Node.js-like globals (supported by Bun)
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        global: 'readonly',
        // Note: __dirname and __filename removed - not available in ESM
      },
    },

    rules: {
      // ==== TypeScript Rules ====
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',

      // ==== General JavaScript Rules ====
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',
      'no-duplicate-imports': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'prefer-template': 'error',
      'object-shorthand': 'error',
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
    },
  },

  // ==== File-Specific Overrides ====
  // Allow console.log in specific files that need it
  {
    files: [
      '**/main.ts',           // Entry points need startup logs
      '**/logger.ts',         // Logger implementations
      '**/logger/*.ts',       // Logger modules
      '**/tokenTracker.ts',   // Token tracking reports
    ],
    rules: {
      'no-console': 'off',
    },
  },

  // ==== Test Files Configuration ====
  // Special configuration for test files
  {
    files: ['**/*.test.ts', '**/__tests__/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: [
          './tsconfig.json',
          './packages/*/tsconfig.test.json',
          './services/*/tsconfig.test.json',
        ],
      },
    },
  }
)
