/**
 * The APIs `.agent-docs/open/error-boundary-props.md` proposes, as types.
 * A is what `packages/tanstack-react-query/src/error-boundary.ts` builds:
 * everything in `createErrorBoundary()`, and only `children` on the
 * component. B adds react-error-boundary's `resetKeys`, `onReset` and
 * `onError` as props. C moves the fallback to a required prop.
 */
import type { ErrorInfo, ReactNode } from 'react';

declare const owned: unique symbol;

interface Owned<TCodes extends string, TUnexpected extends boolean> {
  readonly [owned]: {
    readonly codes: TCodes;
    readonly unexpected: TUnexpected;
  };
}

type Fallback = (props: {
  readonly error: unknown;
  readonly reset: () => void;
}) => ReactNode;

interface SpecA<TCodes extends string, TUnexpected extends boolean, TParent> {
  readonly name: string;
  readonly parent?: TParent;
  readonly claims: ReadonlyArray<TCodes>;
  readonly unexpected?: TUnexpected;
  readonly fallback: Fallback;
}

type Chain<TParent> =
  TParent extends Owned<infer C, infer U> ? { codes: C; unexpected: U } : never;
type Codes<TCodes extends string, TParent> =
  | TCodes
  | ([TParent] extends [never] ? never : Chain<TParent>['codes']);

/** A: the component takes only `children`. */
export declare function createErrorBoundaryA<
  const TCodes extends string,
  TUnexpected extends boolean = false,
  TParent = never,
>(
  spec: SpecA<TCodes, TUnexpected, TParent>,
): readonly [
  Boundary: ((props: { readonly children?: ReactNode }) => ReactNode) &
    Owned<Codes<TCodes, TParent>, TUnexpected>,
  useBoundary: () => unknown,
];

/** B: why a boundary reset itself, as react-error-boundary's `onReset` says. */
export type ResetDetails =
  | { readonly reason: 'reset' }
  | {
      readonly reason: 'keys';
      readonly prev: ReadonlyArray<unknown>;
      readonly next: ReadonlyArray<unknown>;
    };

/** B: what can change per place a boundary is mounted. */
export interface BoundaryPropsB {
  readonly children?: ReactNode;
  /** Resets the boundary when one of these changes, like react-error-boundary's. */
  readonly resetKeys?: ReadonlyArray<unknown>;
  readonly onReset?: (details: ResetDetails) => void;
  /** Called with each error this boundary renders its fallback for. */
  readonly onError?: (error: unknown, info: ErrorInfo) => void;
  /** Replaces the factory's fallback here. */
  readonly fallback?: Fallback;
}

export declare function createErrorBoundaryB<
  const TCodes extends string,
  TUnexpected extends boolean = false,
  TParent = never,
>(
  spec: SpecA<TCodes, TUnexpected, TParent>,
): readonly [
  Boundary: ((props: BoundaryPropsB) => ReactNode) &
    Owned<Codes<TCodes, TParent>, TUnexpected>,
  useBoundary: () => unknown,
];

/** C: the factory only says what a boundary owns; each mount passes its fallback. */
export declare function createErrorBoundaryC<
  const TCodes extends string,
  TUnexpected extends boolean = false,
  TParent = never,
>(
  spec: Omit<SpecA<TCodes, TUnexpected, TParent>, 'fallback'>,
): readonly [
  Boundary: ((
    props: BoundaryPropsB & { readonly fallback: Fallback },
  ) => ReactNode) &
    Owned<Codes<TCodes, TParent>, TUnexpected>,
  useBoundary: () => unknown,
];
