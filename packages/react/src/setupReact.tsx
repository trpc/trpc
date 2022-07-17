import type { AnyRouter } from '@trpc/server';
import { createContext } from 'react';
import { _createReactQueryHooks } from './createReactQueryHooks';
import { TRPCContextState } from './internals/context';

export function setupReact<TRouter extends AnyRouter, TSSRContext = unknown>() {
  return _createReactQueryHooks<TRouter, TSSRContext>({
    Context: createContext<TRPCContextState<TRouter, TSSRContext>>(null as any),
  });
}
