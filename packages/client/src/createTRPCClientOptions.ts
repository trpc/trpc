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

export function createTRPCClientOptions<TRoot extends InferrableClientTypes>() {
  return <$Links extends TRPCLink<TRoot, any>[]>(
    callback: () => {
      links: [...$Links];
    },
  ) => {
    type $Declarations = {
      [TKey in keyof $Links]: $Links[TKey] extends TRPCLink<
        any,
        infer TDeclaration
      >
        ? TRPCLinkDecoration extends TDeclaration
          ? never
          : TDeclaration
        : never;
    }[number];

    type $Merged = {
      [TKey in keyof TRPCLinkDecoration]: TKey extends keyof $Declarations
        ? Simplify<UnionToIntersection<$Declarations[TKey]>>
        : // eslint-disable-next-line @typescript-eslint/ban-types
          {};
    };
    return callback as unknown as () => TRPCDecoratedClientOptions<
      TRoot,
      $Merged & {
        _debug: {
          $Declarations: $Declarations;
          $Links: $Links;
        };
      }
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
