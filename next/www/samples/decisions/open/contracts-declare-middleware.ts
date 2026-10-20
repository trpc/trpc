/**
 * The API `.agent-docs/open/contracts-declare-middleware.md` proposes, as
 * types: B's `c.use(Key)` names a middleware key in a contract, adding its
 * errors to the procedure's and its key to what an implementation requires.
 * A is `experimental_contract` as it is.
 */
import type { Effect, Layer } from 'effect';
import type {
  ContractBuilder,
  ContractConfig,
  ContractDef,
  ContractRootDef,
  ContractWith,
} from '@trpc12/trpc/contract';
import type { DeclaredErrors, ErrorMapInput } from '@trpc12/trpc/server';

/** B: a middleware key (`middleware-as-service.md` B): an id, and the errors its middleware fails with. */
export interface MiddlewareKeyB<Self, TErrors extends ErrorMapInput> {
  readonly '~self': Self;
  readonly '~errors': TErrors;
}

/** B: a contract builder with `.use(Key)`. */
export type ContractBuilderB<TDef extends ContractDef> =
  ContractBuilder<TDef> & {
    use<Self, const TErrors extends ErrorMapInput>(
      key: MiddlewareKeyB<Self, TErrors>,
    ): ContractBuilderB<
      ContractWith<
        TDef,
        {
          errors:
            | TDef['errors']
            | DeclaredErrors<TErrors>[keyof TErrors & string];
          declared: TDef['declared'] & DeclaredErrors<TErrors>;
          requires: TDef['requires'] | Self;
        }
      >
    >;
  };

export declare const experimental_contractB: {
  create<TConfig extends ContractConfig = {}>(): ContractBuilderB<
    ContractRootDef<TConfig['meta'] extends object ? TConfig['meta'] : {}>
  >;
};

/** B: an authentication middleware's key, failing with `UNAUTHORIZED`. */
export interface AuthB {
  readonly '~key': 'Auth';
}
export declare const AuthB: MiddlewareKeyB<AuthB, { UNAUTHORIZED: {} }>;

/** B: `Auth`'s implementation, which the handler's layer gives. */
export declare const AuthLiveB: Layer.Layer<AuthB>;

interface User {
  id: string;
  name: string;
}

/**
 * B: the user `Auth` provides. A resolver under `c.use(Auth)` reads it with
 * nothing left to provide, so it's typed as an Effect that needs nothing.
 */
export declare const CurrentUserB: Effect.Effect<User>;
