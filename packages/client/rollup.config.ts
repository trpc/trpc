import { RollupOptions } from 'rollup';
import { buildConfig } from '../../scripts/getRollupConfig';

export const input = [
  'src/index.ts',
  'src/links/httpLink.ts',
  'src/links/httpBatchLink.ts',
  'src/links/splitLink.ts',
  'src/links/loggerLink.ts',
  'src/links/wsLink.ts',
];

export default function rollup(): RollupOptions[] {
  return buildConfig({
    input,
    packageDir: __dirname,
    target: 'es5',
  });
}
