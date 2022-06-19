import { getRollupConfig } from '../../scripts/rollup';

const config = getRollupConfig({
  input: [
    'src/index.ts',
    'src/./links/httpLink.ts',
    'src/./links/httpBatchLink.ts',
    'src/./links/splitLink.ts',
    'src/./links/loggerLink.ts',
    'src/./links/wsLink.ts',
  ],
});

export default config;
