import { getRollupConfig } from '../../scripts/rollup';

const config = getRollupConfig({
  input: [
    'src/index.ts',
    'src/rx.ts',
    'src/links/httpBatchLink.ts',
    'src/links/httpLink.ts',
    'src/links/loggerLink.ts',
    'src/links/splitLink.ts',
    'src/links/transformerLink.ts',
    'src/links/wsLink.ts',
  ],
});

export default config;
