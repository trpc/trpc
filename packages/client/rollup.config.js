import { getRollupConfig } from '../../scripts/rollup';

const config = getRollupConfig({
  input: ['src/index.ts', 'src/observable/index.ts'],
});

export default config;
