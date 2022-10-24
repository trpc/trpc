import { RollupOptions } from 'rollup';
import { buildConfig } from '../../scripts/getRollupConfig';

// Exporting this for generating barrel-files in scripts/entrypoints.ts
export const input = [
  'src/index.ts',
  'src/ssg/index.ts',
  'src/shared/index.ts',
];

export default function rollup(): RollupOptions[] {
  return buildConfig({
    input,
    packageDir: __dirname,
  });
}
