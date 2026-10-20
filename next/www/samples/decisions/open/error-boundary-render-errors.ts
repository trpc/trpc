/**
 * The APIs `.agent-docs/open/error-boundary-render-errors.md` proposes, as
 * types, with each fallback's `error` typed by what its boundary owns. A:
 * `unexpected: true` owns tRPC's `defined: false` errors, as
 * `packages/tanstack-react-query/src/error-boundary.ts` builds. B: it owns
 * every other throw too. C: a separate `everything: true` does.
 */
import type {
  BuiltinError,
  TrpcError,
  UndeclaredError,
} from '@trpc12/trpc/client';
import type { ReactNode } from 'react';

declare const owned: unique symbol;

interface Owned<TCodes extends string, TUnexpected extends boolean> {
  readonly [owned]: {
    readonly codes: TCodes;
    readonly unexpected: TUnexpected;
  };
}

type Boundary<TCodes extends string, TUnexpected extends boolean> = ((props: {
  readonly children?: ReactNode;
}) => ReactNode) &
  Owned<TCodes, TUnexpected>;

/** What a boundary's own claims can be, whatever `defined` says. */
type Claimed<TCodes extends string> = [TCodes] extends [never]
  ? never
  : TrpcError<TCodes, unknown>;

interface Spec<TCodes extends string, TUnexpected extends boolean, TError> {
  readonly name: string;
  readonly claims: ReadonlyArray<TCodes>;
  readonly unexpected?: TUnexpected;
  readonly fallback: (props: {
    readonly error: TError;
    readonly reset: () => void;
  }) => ReactNode;
}

/** A: `unexpected` is tRPC's undefined errors; anything else passes every boundary. */
export declare function createErrorBoundaryA<
  const TCodes extends string,
  TUnexpected extends boolean = false,
>(
  spec: Spec<
    TCodes,
    TUnexpected,
    | Claimed<TCodes>
    | (TUnexpected extends true ? BuiltinError | UndeclaredError : never)
  >,
): readonly [Boundary<TCodes, TUnexpected>, () => unknown];

/** B: `unexpected` is everything no other boundary owns, so its fallback's error is `unknown`. */
export declare function createErrorBoundaryB<
  const TCodes extends string,
  TUnexpected extends boolean = false,
>(
  spec: Spec<
    TCodes,
    TUnexpected,
    TUnexpected extends true ? unknown : Claimed<TCodes>
  >,
): readonly [Boundary<TCodes, TUnexpected>, () => unknown];

/** C: as A, and `everything: true` takes what isn't tRPC's. */
export declare function createErrorBoundaryC<
  const TCodes extends string,
  TUnexpected extends boolean = false,
  TEverything extends boolean = false,
>(
  spec: Spec<
    TCodes,
    TUnexpected,
    TEverything extends true
      ? unknown
      :
          | Claimed<TCodes>
          | (TUnexpected extends true ? BuiltinError | UndeclaredError : never)
  > & { readonly everything?: TEverything },
): readonly [Boundary<TCodes, TUnexpected>, () => unknown];
