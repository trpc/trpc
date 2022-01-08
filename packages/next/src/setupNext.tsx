import { createReactQueryHooks } from '@trpc/react';
import { AnyRouter } from '@trpc/server';
import { WithTRPCNoSSROptions, WithTRPCSSROptions, withTRPC } from './withTRPC';

export function setupTRPC<TRouter extends AnyRouter>(
  opts: WithTRPCNoSSROptions<TRouter> | WithTRPCSSROptions<TRouter>,
) {
  const hooks = createReactQueryHooks<TRouter>(opts);
  const _withTRPC = withTRPC(opts);
  return {
    ...hooks,
    withTRPC: _withTRPC,
  };
}
