import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * One flat config for the whole workspace.
 *
 * Type-aware linting is deliberately NOT enabled: `tsc --noEmit` already runs on
 * every workspace and catches everything the type-aware rules would, in a
 * fraction of the time. This config exists for the things the compiler does not
 * care about — unused code, accidental `any`, floating promises.
 */
export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/*.tsbuildinfo'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        // A leading underscore marks a parameter that exists to satisfy a
        // signature — Express error handlers need four, whether or not they read
        // all four.
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // `!` is used sparingly and always where the surrounding check has already
      // proved the value is present; a warning keeps it visible without blocking.
      '@typescript-eslint/no-non-null-assertion': 'warn',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': 'off',
    },
  },
  {
    // Browser code has no `process`; server code has no `window`.
    files: ['client/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { window: 'readonly', document: 'readonly', localStorage: 'readonly' },
    },
  },
);
