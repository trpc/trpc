import { join } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: '../',
  test: {
    environment: 'jsdom',
    globals: true,
    snapshotFormat: {
      printBasicPrototype: true,
    },
    setupFiles: ['./tests/setupTests.ts'],
    coverage: {
      provider: 'istanbul',
      include: ['./*/src/**/*.{ts,tsx,js,jsx}', '!**/deprecated/**'],
    },
  },
  resolve: {
    alias: {
      '@trpc/next/src': join(__dirname, '../next/src/index.ts'),
      '@trpc/react-query/src/ssg/ssgProxy': join(
        __dirname,
        '../react-query/src/ssg/ssgProxy.ts',
      ),
      '@trpc/react-query/src/ssg': join(
        __dirname,
        '../react-query/src/ssg/index.ts',
      ),
      '@trpc/react-query/src/interop': join(
        __dirname,
        '../react-query/src/interop.ts',
      ),
      '@trpc/react-query/src/createTRPCReact': join(
        __dirname,
        '../react-query/src/createTRPCReact.tsx',
      ),
      '@trpc/react-query/src': join(__dirname, '../react-query/src/index.ts'),
      '@trpc/server/src/core': join(__dirname, '../server/src/core/index.ts'),
      '@trpc/server/src/error/TRPCError': join(
        __dirname,
        '../server/src/error/TRPCError.ts',
      ),
      '@trpc/server/src/error/utils': join(
        __dirname,
        '../server/src/error/utils.ts',
      ),
      '@trpc/server/src/subscription': join(
        __dirname,
        '../server/src/subscription.ts',
      ),
      '@trpc/server/src/observable': join(
        __dirname,
        '../server/src/observable/index.ts',
      ),
      '@trpc/server/src/subscriptions': join(
        __dirname,
        '../server/src/subscriptions/index.ts',
      ),
      '@trpc/server/src/deprecated/router': join(
        __dirname,
        '../server/src/deprecated/router.ts',
      ),
      '@trpc/server/src/adapters/fetch': join(
        __dirname,
        '../server/src/adapters/fetch/index.ts',
      ),
      '@trpc/server/src/adapters/fastify': join(
        __dirname,
        '../server/src/adapters/fastify/index.ts',
      ),
      '@trpc/server/src/adapters/lambda': join(
        __dirname,
        '../server/src/adapters/lambda/index.ts',
      ),
      '@trpc/server/src/adapters/aws-lambda': join(
        __dirname,
        '../server/src/adapters/aws-lambda/index.ts',
      ),
      '@trpc/server/src/adapters/standalone': join(
        __dirname,
        '../server/src/adapters/standalone.ts',
      ),
      '@trpc/server/src/adapters/ws': join(
        __dirname,
        '../server/src/adapters/ws.ts',
      ),
      '@trpc/server/src/adapters/next': join(
        __dirname,
        '../server/src/adapters/next.ts',
      ),
      '@trpc/server/src/adapters/express': join(
        __dirname,
        '../server/src/adapters/express.ts',
      ),
      '@trpc/server/src': join(__dirname, '../server/src/index.ts'),
      '@trpc/client/src/links/internals/createChain': join(
        __dirname,
        '../client/src/links/internals/createChain.ts',
      ),
      '@trpc/client/src/internals/fetchHelpers': join(
        __dirname,
        '../client/src/internals/fetchHelpers.ts',
      ),
      '@trpc/client/src/internals/dataLoader': join(
        __dirname,
        '../client/src/internals/dataLoader.ts',
      ),
      '@trpc/client/src/links/retryLink': join(
        __dirname,
        '../client/src/links/retryLink.ts',
      ),
      '@trpc/client/src': join(__dirname, '../client/src/index.ts'),
    },
  },
});
