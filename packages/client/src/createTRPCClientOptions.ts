import type { AnyTRPCRouter } from '@trpc/server';
import type { CreateTRPCClientOptions } from './createTRPCUntypedClient';
import type { TRPCLinkDecoration } from './links';

const optionsSymbol = Symbol('createTRPCClientOptions');

export function createTRPCClientOptions<TRouter extends AnyTRPCRouter>() {
  return <$Decoration extends Partial<TRPCLinkDecoration>>(
    callback: () => CreateTRPCClientOptions<TRouter, $Decoration>,
  ) => {
    return callback as typeof callback & {
      [optionsSymbol]: {
        decoration: $Decoration;
      };
    };
  };
}

export type inferTRPCClientOptionsDecoration<
  TOptions extends {
    [optionsSymbol]: {
      decoration: Partial<TRPCLinkDecoration>;
    };
  },
> = TOptions[typeof optionsSymbol]['decoration'];
