// AUDITORIA do backend (avulsa, não entra no CI): ESLint tipado do frontend aplicado a backend/src.
import tseslint from 'typescript-eslint';
import { defineConfig } from 'eslint/config';
export default defineConfig([
  {
    files: ['**/*.ts'],
    ignores: ['**/*.test.ts'],
    languageOptions: { parser: tseslint.parser, parserOptions: { project: './tsconfig.json', tsconfigRootDir: new URL('../../backend/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') } },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { arguments: false } }],
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/only-throw-error': 'error',
    },
  },
]);
