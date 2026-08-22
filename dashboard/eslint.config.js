// ESLint — warnings-first rollout (automation grill Q1).
// Everything warns today so the gate runs green while existing code gets
// cleaned up; flip warn->error per rule as findings are fixed.
// NOTE: eslint-plugin-react-hooks pinned to v5 — v7 native-crashes on
// Windows full-tree runs (exit 0xC0000409); v5 is stable across CI+local.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', '*.config.js', 'api/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/no-unused-expressions': 'warn',
      'prefer-rest-params': 'warn',
      'prefer-const': 'warn',
      'no-console': 'warn',
    },
  },
);
