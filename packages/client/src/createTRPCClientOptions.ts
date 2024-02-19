import type { AnyTRPCRouter } from '@trpc/server';
import { createFlatProxy } from '@trpc/server/unstable-core-do-not-import';
import type { CreateTRPCClientOptions } from './createTRPCUntypedClient';
import type { TRPCLinkDecoration } from './links';

function createTRPCClientOptionsInner<
  TRouter extends AnyTRPCRouter,
  TDecoration extends Partial<TRPCLinkDecoration>,
>(callback: () => CreateTRPCClientOptions<TRouter, TDecoration>) {
  return {
    $types: createFlatProxy<{
      router: TRouter;
      decoration: TDecoration;
    }>((path) => {
      throw new Error(
        `Cannot access $types.${path} - this only exists for types`,
      );
    }),
    callback,
  };
}
export function createTRPCClientOptions<TRouter extends AnyTRPCRouter>() {
  return <$Decoration extends Partial<TRPCLinkDecoration>>(
    callback: () => CreateTRPCClientOptions<TRouter, $Decoration>,
  ) => createTRPCClientOptionsInner<TRouter, $Decoration>(callback);
}

export type AnyTRPCClientOptions = ReturnType<
  typeof createTRPCClientOptionsInner<any, any>
>;
