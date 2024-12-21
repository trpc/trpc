import { fileURLToPath } from 'url';
import type { RollupOptions } from 'rollup';
import { buildConfig } from '../../scripts/getRollupConfig';

export const input = [
  'src/index.ts',
  'src/links/httpBatchLink.ts',
  'src/links/httpLink.ts',
  'src/links/loggerLink.ts',
  'src/links/splitLink.ts',
  'src/links/wsLink/wsLink.ts',
  'src/unstable-internals.ts',
];

export default function rollup(): RollupOptions[] {
  return buildConfig({
    input,
    packageDir: fileURLToPath(new URL('.', import.meta.url)),
  });
}
