import { RollupOptions } from 'rollup';
import { INPUTS, buildConfig } from '../../rollup.config';

export default function rollup(): RollupOptions[] {
  return [
    ...buildConfig({
      input: INPUTS.next,
      packageDir: '.',
    }),
  ];
}
