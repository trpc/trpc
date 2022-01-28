import { getRollupConfig } from '../../scripts/rollup';

const config = getRollupConfig({
  input: ['src/index.ts', 'src/ssg.ts'],
});

export default config;
