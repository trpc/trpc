import type { AnyTRPCRouter } from '@trpc/server';
import type {
  InferrableClientTypes,
  Simplify,
  Unwrap,
} from '@trpc/server/unstable-core-do-not-import';
import type { TRPCLink, TRPCLinkDecoration } from './links';

const typesSymbol = Symbol('createTRPCClientOptions');

type UnionToIntersection<TUnion> = (
  TUnion extends any ? (x: TUnion) => void : never
) extends (x: infer I) => void
  ? I
  : never;

export function createTRPCClientOptions<TRouter extends AnyTRPCRouter>() {
  return <$Links extends TRPCLink<TRouter, any>>(
    callback: () => {
      links: $Links[];
    },
  ) => {
    type $Declarations = $Links extends TRPCLink<any, infer TDeclarations>
      ? TDeclarations
      : never;
    type $Union = UnionToIntersection<$Declarations>;

    type $Merged = {
      [TKey in keyof TRPCLinkDecoration]: TKey extends keyof $Union
        ? Simplify<$Union[TKey]>
        : // eslint-disable-next-line @typescript-eslint/ban-types
          {};
    };
    return callback as unknown as () => TRPCDecoratedClientOptions<
      TRouter,
      $Merged
    >;
  };
}

export type TRPCDecoratedClientOptions<
  TRoot extends InferrableClientTypes,
  TDecoration extends TRPCLinkDecoration,
> = {
  links: TRPCLink<TRoot>[];
  [typesSymbol]: TDecoration;
};

export type inferTRPCClientOptionTypes<
  TOptions extends
    | TRPCDecoratedClientOptions<any, any>
    | (() => TRPCDecoratedClientOptions<any, any>),
> = Unwrap<TOptions>[typeof typesSymbol];
