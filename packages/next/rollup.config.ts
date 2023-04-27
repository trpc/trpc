import { RollupOptions } from 'rollup';
import { __dirname, buildConfig } from '../../scripts/getRollupConfig';

export const input = ['src/index.ts'];

export default function rollup(): RollupOptions[] {
  return buildConfig({
    input,
    packageDir: __dirname,
  });
}
