import { fileURLToPath } from 'url';
import type { RollupOptions } from 'rollup';
import { buildConfig } from '../../scripts/getRollupConfig';

export const input = [
  'src/index.ts',
  'src/http/index.ts',
  'src/rpc/index.ts',
  'src/observable/index.ts',
];

export default function rollup(): RollupOptions[] {
  return buildConfig({
    input,
    packageDir: fileURLToPath(new URL('.', import.meta.url)),
  });
}
