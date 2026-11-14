import { createRequire } from 'node:module';
import * as path from 'node:path';
import { expect, it } from 'vitest';
import { generateOpenAPIDocument } from '../src/generate';

// https://github.com/trpc/trpc/issues/8044
it('generates a document with TypeScript 7', async () => {
  const require = createRequire(import.meta.url);
  const { version } = require('typescript/package.json') as {
    version: string;
  };
  expect(version).toMatch(/^7\./);

  const doc = await generateOpenAPIDocument(
    path.resolve(__dirname, 'routers', 'appRouter.router.ts'),
    { exportName: 'AppRouter' },
  );

  expect(doc.paths?.['/greeting']?.get?.operationId).toBe('greeting');
});
