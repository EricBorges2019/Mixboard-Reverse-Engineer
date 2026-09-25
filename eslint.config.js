import tsParser from '@typescript-eslint/parser';
import functionContracts from './tools/eslint-function-contracts.js';

export default [
  { ignores: ['**/node_modules/**', '**/dist/**', 'data/**', 'captures/**', 'docs/**', '**/playwright-report/**'] },
  {
    files: ['**/*.{ts,tsx,js}'],
    languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { mixboard: { rules: { 'function-contracts': functionContracts } } },
    rules: { 'mixboard/function-contracts': 'error' },
  },
  {
    files: ['**/*.test.{ts,tsx,js}', '**/test/**', '**/e2e/**'],
    rules: { 'mixboard/function-contracts': 'off' },
  },
];
