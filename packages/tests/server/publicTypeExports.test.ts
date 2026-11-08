import type { NextCacheLinkOptions as _NextCacheLinkOptions } from '@trpc/next/app-dir/links/nextCache';
import type {
  NextLinkBaseOptions as _NextLinkBaseOptions,
  NextLinkBatchOptions as _NextLinkBatchOptions,
  NextLinkSingleOptions as _NextLinkSingleOptions,
} from '@trpc/next/app-dir/links/nextHttp';
import type {
  Caller as _Caller,
  DecorateProcedure as _DecorateProcedure,
  DecorateRouterRecord as _DecorateRouterRecord,
} from '@trpc/react-query/rsc';
import type {
  CreateServerSideHelpersOptions as _CreateServerSideHelpersOptions,
  CreateSSGHelpersExternal as _CreateSSGHelpersExternal,
  CreateSSGHelpersInternal as _CreateSSGHelpersInternal,
  DecoratedProcedureSSGRecord as _DecoratedProcedureSSGRecord,
  SSGFns as _SSGFns,
} from '@trpc/react-query/server';
import type {
  inferAPIGWReturn as _inferAPIGWReturn,
  LambdaEvent as _LambdaEvent,
} from '@trpc/server/adapters/aws-lambda';
import type { FastifyRequestHandlerOptions as _FastifyRequestHandlerOptions } from '@trpc/server/adapters/fastify';
import type { StandaloneHandlerOptions as _StandaloneHandlerOptions } from '@trpc/server/adapters/standalone';

test('type-only exports stay importable from the public entry points', () => {
  // These types were only public by accident: older bundler output left
  // `export {}` off the `.d.ts` entry points, so every top-level type in them
  // counted as exported. Newer output adds `export {}`, so the source exports
  // them on purpose to keep them importable. Removing any is a breaking change.
  // The imports above are the assertion: `pnpm typecheck-packages` fails if
  // one of them stops being exported.
  expect(true).toBe(true);
});
