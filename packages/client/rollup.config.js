import { getRollupConfig } from '../../scripts/rollup';

const config = getRollupConfig({
  input: ['src/index.ts'],
});

export default config;
