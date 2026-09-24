import { defineConfig, globalIgnores } from 'eslint/config';
import next from 'eslint-config-next';

export default defineConfig([
  ...next,
  {
    rules: {
      'react/no-unescaped-entities': 'off',
      // New in eslint-config-next 16; existing components predate them.
      // Reported as warnings until those components are reworked.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/refs': 'warn',
    },
  },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
]);
