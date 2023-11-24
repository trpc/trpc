import { RollupOptions } from 'rollup';
import { buildConfig } from '../../scripts/getRollupConfig';

export const input = [
  'src/index.ts',
  'src/unstableInternalsExport.ts',
  // <@deprecated - remove for v12>
  'src/shared.ts',
  'src/links/httpLink.ts',
  'src/links/httpBatchLink.ts',
  'src/links/splitLink.ts',
  'src/links/loggerLink.ts',
  'src/links/wsLink.ts',
  // </@deprecated>
];

export default function rollup(): RollupOptions[] {
  return buildConfig({
    input,
    packageDir: __dirname,
  });
}
