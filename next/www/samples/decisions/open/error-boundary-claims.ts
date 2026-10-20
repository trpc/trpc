/**
 * The APIs `.agent-docs/open/error-boundary-claims.md` proposes, as types.
 * A lists codes, as `packages/tanstack-react-query/src/error-boundary.ts`
 * builds. B takes the error map the server passes to `.errors()`, plus
 * `true` for codes nothing declares.
 */
import type { ReactNode } from 'react';

declare const owned: unique symbol;

interface Owned<TCodes extends string> {
  readonly [owned]: { readonly codes: TCodes };
}

type Boundary<TCodes extends string> = ((props: {
  readonly children?: ReactNode;
}) => ReactNode) &
  Owned<TCodes>;

type Fallback = (props: {
  readonly error: unknown;
  readonly reset: () => void;
}) => ReactNode;

/** A: `claims` lists codes. */
export declare function createErrorBoundaryA<
  const TCodes extends string,
>(spec: {
  readonly name: string;
  readonly claims: ReadonlyArray<TCodes>;
  readonly fallback: Fallback;
}): readonly [Boundary<TCodes>, () => unknown];

/** B: `claims` is an `.errors()` map; a code with no declaration (a link's) is `true`. */
export declare function createErrorBoundaryB<
  const TClaims extends Readonly<Record<string, object | true>>,
>(spec: {
  readonly name: string;
  readonly claims: TClaims;
  readonly fallback: Fallback;
}): readonly [Boundary<keyof TClaims & string>, () => unknown];
