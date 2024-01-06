import { RollupOptions } from 'rollup';
import { buildConfig } from '../../scripts/getRollupConfig';

export const input = [
  'src/adapters/aws-lambda/index.ts',
  'src/adapters/express.ts',
  'src/adapters/fastify/index.ts',
  'src/adapters/fetch/index.ts',
  'src/adapters/next.ts',
  'src/adapters/node-http/content-type/form-data/index.ts',
  'src/adapters/node-http/content-type/json/index.ts',
  'src/adapters/node-http/index.ts',
  'src/adapters/standalone.ts',
  'src/adapters/ws.ts',
  'src/http.ts',
  'src/index.ts',
  'src/observable.ts',
  'src/rpc.ts',
  'src/shared.ts',
];

export default function rollup(): RollupOptions[] {
  return buildConfig({
    input,
    packageDir: __dirname,
  });
}
