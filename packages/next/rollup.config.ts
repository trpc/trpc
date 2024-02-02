import { fileURLToPath } from 'url';
import type { RollupOptions } from 'rollup';
import { buildConfig } from '../../scripts/getRollupConfig';

export const input = [
  'src/index.ts',
  'src/app-dir/server.ts',
  'src/app-dir/client.ts',
  'src/app-dir/links/nextCache.ts',
  'src/app-dir/links/nextHttp.ts',
  'src/ssrPrepass.ts',
];

export default function rollup(): RollupOptions[] {
  return buildConfig({
    input,
    packageDir: fileURLToPath(new URL('.', import.meta.url)),
  });
}
