/* eslint-disable @typescript-eslint/naming-convention */
import {
  CreateReactUtilsProxy,
  DecoratedProcedureRecord,
  createHooksInternal,
  createReactProxyDecoration,
  createReactQueryUtilsProxy,
} from '@trpc/react-query/shared';
import { AnyRouter, ClientDataTransformerOptions } from '@trpc/server';
import { createFlatProxy } from '@trpc/server/shared';
import { NextPageContext } from 'next/types';
import { useMemo } from 'react';
import { WithTRPCNoSSROptions, WithTRPCSSROptions, withTRPC } from './withTRPC';

export function createTRPCNext<
  TRouter extends AnyRouter,
  TSSRContext extends NextPageContext = NextPageContext,
  Transformer extends ClientDataTransformerOptions | undefined = undefined,
>(
  opts:
    | WithTRPCNoSSROptions<TRouter, Transformer>
    | WithTRPCSSROptions<TRouter, Transformer>,
) {
  const hooks = createHooksInternal<TRouter, TSSRContext>({
    unstable_overrides: opts.unstable_overrides,
  });

  // TODO: maybe set TSSRContext to `never` when using `WithTRPCNoSSROptions`
  const _withTRPC = withTRPC<TRouter, TSSRContext, Transformer>(opts);

  type CreateTRPCNext = {
    useContext(): CreateReactUtilsProxy<TRouter, TSSRContext>;
    withTRPC: typeof _withTRPC;
  } & DecoratedProcedureRecord<TRouter['_def']['record']>;

  return createFlatProxy<CreateTRPCNext>((key) => {
    if (key === 'useContext') {
      return () => {
        const context = hooks.useContext();
        // create a stable reference of the utils context
        return useMemo(() => {
          return (createReactQueryUtilsProxy as any)(context);
        }, [context]);
      };
    }

    if (key === 'withTRPC') {
      return _withTRPC;
    }

    return createReactProxyDecoration(key as string, hooks);
  });
}
