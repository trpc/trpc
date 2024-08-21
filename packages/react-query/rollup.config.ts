import { fileURLToPath } from 'url';
import type { RollupOptions } from 'rollup';
import { buildConfig } from '../../scripts/getRollupConfig';

export const input = [
  'src/index.ts',
  'src/rsc.tsx',
  'src/server/index.ts',
  'src/shared/index.ts',
];

export default function rollup(): RollupOptions[] {
  return buildConfig({
    input,
    packageDir: fileURLToPath(new URL('.', import.meta.url)),
  });
}
