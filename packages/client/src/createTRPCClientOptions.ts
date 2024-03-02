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

/** @internal */
type CreateTRPCClientOptionsTyped<
  TRoot extends InferrableClientTypes,
  TLinks extends TRPCLink<TRoot, any> = TRPCLink<TRoot, object>,
> = {
  links: TLinks[];
};
export function createTRPCClientOptions<TRoot extends InferrableClientTypes>() {
  return <$Links extends TRPCLink<TRoot, any>>(
    callback: () => CreateTRPCClientOptionsTyped<TRoot, $Links>,
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
    return callback as unknown as () => TRPCDecoratedClientOptions<
      TRoot,
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
