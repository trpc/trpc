import type {
  InferrableClientTypes,
  Simplify,
} from '@trpc/server/unstable-core-do-not-import';
import type { CreateTRPCClientOptions } from './createTRPCUntypedClient';
import type { TRPCLink, TRPCLinkDecoration } from './links';

const typesSymbol = Symbol('createTRPCClientOptions');

type UnionToIntersection<TUnion> = (
  TUnion extends any ? (x: TUnion) => void : never
) extends (x: infer I) => void
  ? I
  : never;

export function createTRPCClientOptions<TRoot extends InferrableClientTypes>() {
  return <$Links extends TRPCLink<TRoot, any>>(
    callback: () => CreateTRPCClientOptions<TRoot, $Links>,
  ) => {
    type $Declarations = $Links extends TRPCLink<TRoot, infer TDeclarations>
      ? TDeclarations
      : never;
    type $Union = UnionToIntersection<$Declarations>;

    type $Merged = {
      [TKey in keyof TRPCLinkDecoration]: TKey extends keyof $Union
        ? Simplify<$Union[TKey]>
        : // eslint-disable-next-line @typescript-eslint/ban-types
          {};
    };
    return callback as CreateTRPCClientOptionCallback<TRoot, $Merged>;
  };
}

export type CreateTRPCClientOptionCallback<
  TRoot extends InferrableClientTypes,
  TDecoration,
> = (() => CreateTRPCClientOptions<TRoot, any>) & {
  [typesSymbol]: TDecoration;
};

export type inferTRPCClientOptionTypes<
  TOptions extends {
    [typesSymbol]: any;
  },
> = TOptions[typeof typesSymbol];
